[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$ResolveToolsOnly,
    [Parameter(Position = 0)]
    [string]$BackupDirectory = '',
    [ValidateRange(1024, 65535)]
    [int]$Port = 55433,
    [switch]$LeaveRunning,
    [string]$RepoRootOverride = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = if ($RepoRootOverride) {
    [IO.Path]::GetFullPath($RepoRootOverride)
} else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}
$RuntimeRoot = if ($env:LIVE_IN_HDU_RUNTIME_ROOT) {
    [IO.Path]::GetFullPath($env:LIVE_IN_HDU_RUNTIME_ROOT)
} else {
    'D:\Star\LIVE_IN_HDU_RUNTIME'
}
$BackupRoot = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot 'backups'))
$RestoreRoot = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot 'restore-drills'))
$RuntimeTooling = Join-Path $PSScriptRoot 'runtime-tooling.ps1'
$ProjectPrefix = 'live-in-hdu-restore-'

$BusinessStateSql = @'
SELECT json_build_object(
  'intents', (SELECT COUNT(*) FROM question_intents),
  'aliases', (SELECT COUNT(*) FROM intent_aliases),
  'rawAnswers', (SELECT COUNT(*) FROM raw_answers),
  'canonicalAnswers', (SELECT COUNT(*) FROM canonical_answers),
  'reviews', (SELECT COUNT(*) FROM review_tasks),
  'outbox', (SELECT COUNT(*) FROM integration_outbox),
  'knowledgeImports', (SELECT COUNT(*) FROM knowledge_imports),
  'q11RawAnswers', (
    SELECT COUNT(*) FROM raw_answers r
    JOIN question_intents q ON q.id = r.intent_id
    WHERE q.external_id = 'Q11'
  ),
  'q11Published', (
    SELECT COUNT(*) FROM canonical_answers c
    JOIN question_intents q ON q.id = c.intent_id
    WHERE q.external_id = 'Q11' AND c.status = 'published'
  ),
  'invalidNumericRawAnswers', (
    SELECT COUNT(*) FROM raw_answers WHERE btrim(answer_text) = '19'
  ),
  'reviewOrderFingerprint', COALESCE((
    SELECT md5(string_agg(
      id::text || ':' || ordinal::text || ':' || created_at::text,
      '|' ORDER BY created_at ASC, ordinal ASC
    )) FROM review_tasks
  ), '')
)::text;
'@

function Get-DockerTool {
    if (-not (Test-Path -LiteralPath $RuntimeTooling -PathType Leaf)) {
        throw "Runtime tooling helper is missing: $RuntimeTooling"
    }
    . $RuntimeTooling
    return (Resolve-LiveInHduTool `
        -Name 'docker' `
        -RuntimeRoot $RuntimeRoot `
        -RuntimeRelativePath 'docker\DockerDesktop\resources\bin\docker.exe')
}

function Assert-PathWithin([string]$Candidate, [string]$Parent, [string]$Label) {
    $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
    $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if (-not $candidatePath.StartsWith(
        "$parentPath\",
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "$Label must remain under $parentPath, received: $candidatePath"
    }
    return $candidatePath
}

function Expand-Gzip([string]$InputPath, [string]$OutputPath) {
    $inputStream = [IO.File]::OpenRead($InputPath)
    try {
        $gzip = [IO.Compression.GZipStream]::new(
            $inputStream,
            [IO.Compression.CompressionMode]::Decompress
        )
        try {
            $outputStream = [IO.File]::Create($OutputPath)
            try {
                $gzip.CopyTo($outputStream)
            } finally {
                $outputStream.Dispose()
            }
        } finally {
            $gzip.Dispose()
        }
    } finally {
        $inputStream.Dispose()
    }
}

function Get-ContainerDatabaseState(
    [string]$DockerCli,
    [string]$Container,
    [string]$User,
    [string]$Database
) {
    $json = (& $DockerCli exec $Container `
        psql -U $User -d $Database -At -c $BusinessStateSql | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)) {
        throw 'Could not inspect the restored PostgreSQL database.'
    }
    try {
        return ($json | ConvertFrom-Json)
    } catch {
        throw 'Restored PostgreSQL state was not valid JSON.'
    }
}

if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        sourceManifestVerified = $true
        productionDataModified = $false
        containerRemovedAfterVerification = -not $LeaveRunning
        databaseOwnerFromManifest = $true
        waitsForFinalPostgresStartup = $true
        testPort = $Port
        restoreRoot = $RestoreRoot
        projectPrefix = $ProjectPrefix
        artifacts = @('restore-report.json', 'postgres-data')
    } | ConvertTo-Json -Compress
    exit 0
}

if ($ResolveToolsOnly) {
    $dockerTool = Get-DockerTool
    [ordered]@{
        dockerInvoked = $false
        dockerCli = $dockerTool.Path
        dockerSource = $dockerTool.Source
        restoreRoot = $RestoreRoot
    } | ConvertTo-Json -Compress
    exit 0
}

if ([IO.Path]::GetPathRoot($RestoreRoot).ToUpperInvariant() -ne 'D:\') {
    throw 'Restore drills must remain on D:.'
}
if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
    throw 'BackupDirectory is required for a real restore drill.'
}
$source = Assert-PathWithin $BackupDirectory $BackupRoot 'Backup directory'
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Backup directory does not exist: $source"
}
$manifestPath = Join-Path $source 'manifest.json'
$dumpPath = Join-Path $source 'live-in-hdu.sql.gz'
if (
    -not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)
) {
    throw 'Backup is missing manifest.json or live-in-hdu.sql.gz.'
}
try {
    $manifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 |
        ConvertFrom-Json
} catch {
    throw 'Backup manifest is not valid JSON.'
}
if (
    $null -eq $manifest.database -or
    @($manifest.hashes).Count -eq 0 -or
    [string]::IsNullOrWhiteSpace([string]$manifest.databaseUser) -or
    [string]::IsNullOrWhiteSpace([string]$manifest.databaseName)
) {
    throw 'Backup manifest does not contain database identity, state, and hashes.'
}
$databaseUser = ([string]$manifest.databaseUser).Trim()
$databaseName = ([string]$manifest.databaseName).Trim()
if (
    $databaseUser -notmatch '^[a-z_][a-z0-9_]{0,62}$' -or
    $databaseName -notmatch '^[a-z_][a-z0-9_]{0,62}$'
) {
    throw 'Backup manifest contains an unsafe PostgreSQL user or database name.'
}
if (
    $null -ne $manifest.PSObject.Properties['databaseImage'] -and
    [string]$manifest.databaseImage -ne 'postgres:17-alpine'
) {
    throw 'Backup manifest requires an unsupported PostgreSQL image.'
}
foreach ($entry in @($manifest.hashes)) {
    $relative = [string]$entry.path
    if (
        [string]::IsNullOrWhiteSpace($relative) -or
        [IO.Path]::IsPathRooted($relative) -or
        $relative -match '(^|[\\/])\.\.([\\/]|$)'
    ) {
        throw "Backup manifest contains an unsafe path: $relative"
    }
    $artifact = Assert-PathWithin (Join-Path $source $relative) $source 'Backup artifact'
    if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
        throw "Backup artifact is missing: $relative"
    }
    $actualHash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
    if ($actualHash -ine [string]$entry.sha256) {
        throw "Backup checksum mismatch: $relative"
    }
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) {
    throw "Restore drill port is already in use: $Port"
}

$dockerTool = Get-DockerTool
$dockerCli = [string]$dockerTool.Path
& $dockerCli info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop engine is not ready.'
}

New-Item -ItemType Directory -Path $RestoreRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Assert-PathWithin `
    (Join-Path $RestoreRoot "business-$stamp") `
    $RestoreRoot `
    'Restore destination'
if (Test-Path -LiteralPath $destination) {
    throw "Restore destination already exists: $destination"
}
$dataDirectory = Join-Path $destination 'postgres-data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$container = "$ProjectPrefix$stamp"
$passwordBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$databasePassword = [Convert]::ToHexString($passwordBytes).ToLowerInvariant()
$environmentFile = Join-Path $destination 'postgres.env'
$expandedSql = Join-Path $destination 'live-in-hdu.sql'
[IO.File]::WriteAllText(
    $environmentFile,
    "POSTGRES_USER=$databaseUser`nPOSTGRES_PASSWORD=$databasePassword`nPOSTGRES_DB=$databaseName`n",
    [Text.UTF8Encoding]::new($false)
)

$containerCreated = $false
$verified = $false
try {
    $containerId = (& $dockerCli run --detach `
        --name $container `
        --env-file $environmentFile `
        --publish "127.0.0.1:${Port}:5432" `
        --volume "${dataDirectory}:/var/lib/postgresql/data" `
        postgres:17-alpine | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw 'Could not start isolated restore PostgreSQL container.'
    }
    $containerCreated = $true
    Remove-Item -LiteralPath $environmentFile -Force

    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $containerLogs = (& $dockerCli logs $container 2>&1 | Out-String)
        if ($containerLogs -match 'PostgreSQL init process complete; ready for start up') {
            $databaseCount = (& $dockerCli exec $container `
                psql -U $databaseUser -d postgres -At `
                -c "SELECT COUNT(*) FROM pg_database WHERE datname = '$databaseName';" `
                2>$null | Out-String).Trim()
            if ($LASTEXITCODE -eq 0 -and $databaseCount -eq '1') {
                $ready = $true
                break
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        throw 'Isolated restore PostgreSQL did not become ready.'
    }

    Expand-Gzip $dumpPath $expandedSql
    $restoreStdout = Join-Path $destination 'restore.stdout.log'
    $restoreStderr = Join-Path $destination 'restore.stderr.log'
    $restoreProcess = Start-Process `
        -FilePath $dockerCli `
        -ArgumentList @(
            'exec',
            '-i',
            $container,
            'psql',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            $databaseUser,
            '-d',
            $databaseName
        ) `
        -RedirectStandardInput $expandedSql `
        -RedirectStandardOutput $restoreStdout `
        -RedirectStandardError $restoreStderr `
        -Wait `
        -PassThru `
        -WindowStyle Hidden
    if ($restoreProcess.ExitCode -ne 0) {
        $diagnostics = if (Test-Path -LiteralPath $restoreStderr) {
            (Get-Content -LiteralPath $restoreStderr -Tail 20) -join [Environment]::NewLine
        } else {
            'No stderr log was created.'
        }
        throw "PostgreSQL restore failed with exit code $($restoreProcess.ExitCode).`n$diagnostics"
    }
    Remove-Item -LiteralPath $expandedSql -Force

    $restoredState = Get-ContainerDatabaseState `
        $dockerCli `
        $container `
        $databaseUser `
        $databaseName
    $expectedStateJson = $manifest.database | ConvertTo-Json -Compress -Depth 4
    $restoredStateJson = $restoredState | ConvertTo-Json -Compress -Depth 4
    if ($restoredStateJson -cne $expectedStateJson) {
        throw "Restored database state does not match the backup manifest."
    }
    if (
        [int64]$restoredState.q11RawAnswers -ne 0 -or
        [int64]$restoredState.q11Published -ne 0 -or
        [int64]$restoredState.invalidNumericRawAnswers -ne 0
    ) {
        throw 'Restored database violates Q11 or numeric-answer invariants.'
    }

    [ordered]@{
        completedAt = [DateTime]::UtcNow.ToString('o')
        sourceBackup = $source
        sourceManifestVerified = $true
        productionDataModified = $false
        container = $container
        testPort = $Port
        dataDirectory = $dataDirectory
        database = $restoredState
        containerLeftRunning = [bool]$LeaveRunning
    } | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath (Join-Path $destination 'restore-report.json') -Encoding UTF8
    $verified = $true
} finally {
    Remove-Item -LiteralPath $environmentFile, $expandedSql -Force -ErrorAction SilentlyContinue
    if ($containerCreated -and -not $LeaveRunning) {
        & $dockerCli rm --force $container | Out-Null
    }
}

if (-not $verified) {
    throw 'Restore drill did not reach verified state.'
}
Write-Output $destination
