param(
    [switch]$OpenBrowser,
    [int]$HealthTimeoutSeconds = 30,
    [string]$DatabasePathOverride = '',
    [int]$PortOverride = 0,
    [string]$InstanceName = 'platform'
)

$ErrorActionPreference = 'Stop'
if ($InstanceName -notmatch '^[a-z0-9-]+$') {
    throw 'InstanceName may contain only lowercase letters, numbers, and hyphens.'
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$DataRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$TempRoot = Join-Path $DataRoot 'temp'
$NpmCache = Join-Path $DataRoot 'npm-cache'
$OutputRoot = Join-Path $RepoRoot 'output\freshman-platform'
$InstanceOutput = if ($InstanceName -eq 'platform') {
    $OutputRoot
} else {
    Join-Path $OutputRoot $InstanceName
}
$RuntimeLink = Join-Path $AppRoot 'runtime'
$DatabasePath = if ($DatabasePathOverride) {
    [IO.Path]::GetFullPath($DatabasePathOverride)
} else {
    Join-Path $RuntimeLink 'live-in-hdu.db'
}
$PidFile = Join-Path $InstanceOutput 'platform.pid.json'
$StdoutLog = Join-Path $InstanceOutput 'platform.stdout.log'
$StderrLog = Join-Path $InstanceOutput 'platform.stderr.log'
$StdinFile = Join-Path $InstanceOutput 'platform.stdin.txt'
$ImportReport = Join-Path $InstanceOutput 'import-report.json'
$WorkbookPath = Join-Path $RepoRoot 'output\playwright\current-40q-2026-07-27.xlsx'
$ServerEntrypoint = Join-Path $AppRoot 'dist\server\index.js'
$ClientEntrypoint = Join-Path $AppRoot 'dist\client\index.html'
$EnvFile = Join-Path $AppRoot '.env.local'
$ExplicitDatabaseProvider = [string]$env:DATABASE_PROVIDER
$ExplicitPostgresUrl = [string]$env:POSTGRES_URL

function Assert-DDriveTarget([string]$PathValue, [string]$Label) {
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label is missing; recreate the required D-drive junction: $PathValue"
    }
    $item = Get-Item -LiteralPath $PathValue -Force
    if ($item.LinkType -notin @('Junction', 'SymbolicLink')) {
        throw "$Label must be a D-drive junction, not a normal C-drive directory: $PathValue"
    }
    $target = [string]($item.Target | Select-Object -First 1)
    if (-not [IO.Path]::IsPathRooted($target)) {
        $target = [IO.Path]::GetFullPath((Join-Path $item.Parent.FullName $target))
    }
    if ([IO.Path]::GetPathRoot($target).ToUpperInvariant() -ne 'D:\') {
        throw "$Label must target D:, target was $target"
    }
}

function Import-LocalEnvironment([string]$PathValue) {
    if (-not (Test-Path -LiteralPath $PathValue)) { return }
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
            continue
        }
        $parts = $trimmed.Split('=', 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Get-NormalizedPath([string]$PathValue) {
    return [IO.Path]::GetFullPath($PathValue).TrimEnd('\').Replace('/', '\')
}

function Test-ExactCommandArgument([string]$CommandLine, [string]$ExpectedArgument) {
    $normalized = $CommandLine.Replace('/', '\')
    $escaped = [regex]::Escape((Get-NormalizedPath $ExpectedArgument))
    return $normalized -match "(?i)(?:^|[\s`"])$escaped(?=$|[\s`"])"
}

function Get-OwnedProcess([int]$ProcessId, [string]$ExpectedEntrypoint) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    $commandLine = [string]$process.CommandLine
    if (-not (Test-ExactCommandArgument $commandLine $ExpectedEntrypoint)) {
        return $null
    }
    return $process
}

function Assert-ValidMetadata($Metadata) {
    $metadataProvider = if ($null -ne $Metadata.PSObject.Properties['databaseProvider']) {
        ([string]$Metadata.databaseProvider).Trim().ToLowerInvariant()
    } else {
        'sqlite'
    }
    $metadataDatabaseMatches = if ($DatabaseProvider -eq 'sqlite') {
        try {
            (Get-NormalizedPath ([string]$Metadata.database)) -ieq
                (Get-NormalizedPath $DatabasePath)
        } catch {
            $false
        }
    } else {
        [string]$Metadata.database -eq 'postgres'
    }
    if (
        [int]$Metadata.pid -le 0 -or
        [int]$Metadata.port -lt 1 -or
        [int]$Metadata.port -gt 65535
    ) {
        throw "PID metadata has an invalid pid or port: $PidFile"
    }
    if (
        (Get-NormalizedPath ([string]$Metadata.appRoot)) -ine (Get-NormalizedPath $AppRoot) -or
        (Get-NormalizedPath ([string]$Metadata.entrypoint)) -ine (Get-NormalizedPath $ServerEntrypoint) -or
        $metadataProvider -ne $DatabaseProvider -or
        -not $metadataDatabaseMatches
    ) {
        throw 'PID metadata does not describe this exact instance; refusing to accept it.'
    }
}

function Read-ValidatedImportReport([string]$PathValue) {
    try {
        $report = Get-Content -Raw -LiteralPath $PathValue -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Import report is invalid; refusing to trust the bootstrap baseline: $PathValue"
    }
    $intents = @($report.intents)
    $rawAnswers = @($report.rawAnswers)
    $intentIds = @($intents | ForEach-Object { [string]$_.id })
    $rawAnswerIds = @($rawAnswers | ForEach-Object { [string]$_.id })
    if (
        [int]$report.questionCount -le 0 -or
        [int]$report.questionCount -ne $intents.Count -or
        [int]$report.acceptedAnswerCount -ne $rawAnswers.Count -or
        [int]$report.acceptedAnswerCount -lt 0 -or
        [int]$report.publishedCount -ne 0 -or
        ($intentIds | Where-Object { -not $_ }).Count -gt 0 -or
        ($rawAnswerIds | Where-Object { -not $_ }).Count -gt 0 -or
        ($intentIds | Sort-Object -Unique).Count -ne $intentIds.Count -or
        ($rawAnswerIds | Sort-Object -Unique).Count -ne $rawAnswerIds.Count
    ) {
        throw "Import report count or identity mismatch; refusing to trust the bootstrap baseline: $PathValue"
    }
    return $report
}

function Assert-DynamicBaseline($State, $Report) {
    if (
        [int]$State.counts.intents -lt [int]$Report.questionCount -or
        [int]$State.counts.rawAnswers -lt [int]$Report.acceptedAnswerCount -or
        [int]$State.counts.q11RawAnswers -ne 0 -or
        [int]$State.counts.q11Published -ne 0 -or
        [int]$State.counts.invalidNumericRawAnswers -ne 0
    ) {
        throw "Database does not satisfy the import-report baseline: $($State.counts | ConvertTo-Json -Compress)"
    }
}

New-Item -ItemType Directory -Path $TempRoot, $NpmCache -Force | Out-Null
Assert-DDriveTarget $RuntimeLink 'Runtime junction'
Assert-DDriveTarget $OutputRoot 'Output junction'
Assert-DDriveTarget (Join-Path $AppRoot 'dist') 'Dist junction'
Assert-DDriveTarget (Join-Path $AppRoot 'node_modules') 'node_modules junction'
New-Item -ItemType Directory -Path $InstanceOutput -Force | Out-Null

Import-LocalEnvironment $EnvFile
if (-not [string]::IsNullOrWhiteSpace($ExplicitDatabaseProvider)) {
    $env:DATABASE_PROVIDER = $ExplicitDatabaseProvider
}
if (-not [string]::IsNullOrWhiteSpace($ExplicitPostgresUrl)) {
    $env:POSTGRES_URL = $ExplicitPostgresUrl
}
$DatabaseProvider = if (
    $DatabasePathOverride -and
    [string]::IsNullOrWhiteSpace($ExplicitDatabaseProvider)
) {
    'sqlite'
} elseif ([string]::IsNullOrWhiteSpace($env:DATABASE_PROVIDER)) {
    'sqlite'
} else {
    $env:DATABASE_PROVIDER.Trim().ToLowerInvariant()
}
if ($DatabaseProvider -notin @('sqlite', 'postgres')) {
    throw "DATABASE_PROVIDER must be sqlite or postgres, received: $DatabaseProvider"
}
if ($DatabaseProvider -eq 'postgres' -and [string]::IsNullOrWhiteSpace($env:POSTGRES_URL)) {
    throw 'POSTGRES_URL is required when DATABASE_PROVIDER=postgres.'
}
$DatabaseIdentity = if ($DatabaseProvider -eq 'sqlite') {
    $DatabasePath
} else {
    'postgres'
}
$env:TEMP = $TempRoot
$env:TMP = $TempRoot
$env:npm_config_cache = $NpmCache
if ($DatabaseProvider -eq 'sqlite') {
    $env:DATABASE_PATH = $DatabasePath
} else {
    Remove-Item Env:DATABASE_PATH -ErrorAction SilentlyContinue
}
$port = if ($PortOverride -gt 0) {
    $PortOverride
} elseif ($env:PORT) {
    [int]$env:PORT
} else {
    3210
}
$env:PORT = [string]$port

if (Test-Path -LiteralPath $PidFile) {
    try {
        $metadata = Get-Content -Raw -LiteralPath $PidFile | ConvertFrom-Json
    } catch {
        throw "PID metadata is invalid; inspect before deleting: $PidFile"
    }
    Assert-ValidMetadata $metadata
    $owned = Get-OwnedProcess ([int]$metadata.pid) $ServerEntrypoint
    if ($owned) {
        $actualPort = [int]$metadata.port
        if ($PortOverride -gt 0 -and $PortOverride -ne $actualPort) {
            throw "Instance is already running on metadata port $actualPort; requested port $PortOverride conflicts."
        }
        try {
            $health = Invoke-RestMethod `
                -Uri "http://localhost:$actualPort/api/health" `
                -TimeoutSec ([Math]::Max(1, [Math]::Min(5, $HealthTimeoutSeconds)))
        } catch {
            throw "Owned process is running but metadata port $actualPort is not healthy."
        }
        if ($health.status -ne 'ok' -or $health.components.database.status -ne 'ok') {
            throw "Owned process is running but metadata port $actualPort returned unhealthy status."
        }
        Write-Output "服务已在运行：http://localhost:$actualPort"
        Write-Output "本机审核后台：http://localhost:$actualPort/admin"
        if ($OpenBrowser) { Start-Process "http://localhost:$actualPort" }
        exit 0
    }
    if (Get-Process -Id ([int]$metadata.pid) -ErrorAction SilentlyContinue) {
        throw "PID $($metadata.pid) belongs to another process; refusing to overwrite $PidFile"
    }
    Remove-Item -LiteralPath $PidFile -Force
}

$buildRequired = -not (Test-Path -LiteralPath $ServerEntrypoint) -or
    -not (Test-Path -LiteralPath $ClientEntrypoint)
if (-not $buildRequired) {
    $sourceFiles = Get-ChildItem -Path @(
        (Join-Path $AppRoot 'src'),
        (Join-Path $AppRoot 'web'),
        (Join-Path $AppRoot 'public')
    ) -Recurse -File
    $sourceFiles += Get-Item @(
        (Join-Path $AppRoot 'package.json'),
        (Join-Path $AppRoot 'package-lock.json'),
        (Join-Path $AppRoot 'tsconfig.json'),
        (Join-Path $AppRoot 'tsconfig.server.json'),
        (Join-Path $AppRoot 'vite.config.ts')
    )
    $latestSource = ($sourceFiles | Measure-Object LastWriteTimeUtc -Maximum).Maximum
    $serverBuiltAt = (Get-Item -LiteralPath $ServerEntrypoint).LastWriteTimeUtc
    $clientBuiltAt = (Get-Item -LiteralPath $ClientEntrypoint).LastWriteTimeUtc
    $oldestEntrypoint = if ($serverBuiltAt -lt $clientBuiltAt) {
        $serverBuiltAt
    } else {
        $clientBuiltAt
    }
    $buildRequired = $latestSource -gt $oldestEntrypoint
}
if ($buildRequired) {
    & npm --prefix $AppRoot run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
}

$DatabaseStateScript = Join-Path $AppRoot 'scripts\database-state.mts'
$ImportScript = Join-Path $AppRoot 'scripts\import-feishu-xlsx.mts'
$state = $null
if ($DatabaseProvider -eq 'sqlite') {
    $stateJson = (& npm --prefix $AppRoot exec -- tsx $DatabaseStateScript --database $DatabasePath | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect production database" }
    $state = $stateJson | ConvertFrom-Json
    $needsBootstrapImport = [int]$state.counts.intents -eq 0 -or
        -not (Test-Path -LiteralPath $ImportReport)
    if ($needsBootstrapImport) {
        if (-not (Test-Path -LiteralPath $WorkbookPath)) {
            throw "First-run workbook is missing: $WorkbookPath"
        }
        $importJson = (& npm --prefix $AppRoot exec -- tsx $ImportScript --input $WorkbookPath --database $DatabasePath | Out-String)
        if ($LASTEXITCODE -ne 0) { throw "First-run workbook import failed" }
        $reportStaging = "$ImportReport.$PID.tmp"
        try {
            [IO.File]::WriteAllText($reportStaging, $importJson, [Text.UTF8Encoding]::new($false))
            Read-ValidatedImportReport $reportStaging | Out-Null
            Move-Item -LiteralPath $reportStaging -Destination $ImportReport -Force
        } finally {
            Remove-Item -LiteralPath $reportStaging -Force -ErrorAction SilentlyContinue
        }
        $stateJson = (& npm --prefix $AppRoot exec -- tsx $DatabaseStateScript --database $DatabasePath | Out-String)
        if ($LASTEXITCODE -ne 0) { throw "Could not verify imported database" }
        $state = $stateJson | ConvertFrom-Json
    }
    $baselineReport = Read-ValidatedImportReport $ImportReport
    Assert-DynamicBaseline $state $baselineReport
}

$node = (Get-Command node -ErrorAction Stop).Source
Remove-Item -LiteralPath $StdoutLog, $StderrLog -Force -ErrorAction SilentlyContinue
[IO.File]::WriteAllText($StdinFile, '', [Text.UTF8Encoding]::new($false))
$process = Start-Process `
    -FilePath $node `
    -ArgumentList @(
        '--preserve-symlinks',
        '--preserve-symlinks-main',
        "`"$ServerEntrypoint`""
    ) `
    -WorkingDirectory $AppRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardInput $StdinFile `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog

$metadata = [ordered]@{
    pid = $process.Id
    startedAt = [DateTime]::UtcNow.ToString('o')
    appRoot = $AppRoot
    entrypoint = $ServerEntrypoint
    databaseProvider = $DatabaseProvider
    database = $DatabaseIdentity
    port = $port
    nodeExecutable = $node
}
[IO.File]::WriteAllText(
    $PidFile,
    ($metadata | ConvertTo-Json -Depth 3),
    [Text.UTF8Encoding]::new($false)
)

$deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
$healthy = $false
while ([DateTime]::UtcNow -lt $deadline) {
    if ($process.HasExited) { break }
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 2
        if ($health.status -eq 'ok' -and $health.components.database.status -eq 'ok') {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 250
    }
}
if (-not $healthy) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    $diagnostics = @()
    if (Test-Path -LiteralPath $StderrLog) {
        $diagnostics += Get-Content -LiteralPath $StderrLog -Tail 30
    }
    if (Test-Path -LiteralPath $StdoutLog) {
        $diagnostics += Get-Content -LiteralPath $StdoutLog -Tail 30
    }
    throw "Service health check failed. Logs: $StderrLog`n$($diagnostics -join [Environment]::NewLine)"
}

Write-Output "用户端：http://localhost:$port"
Write-Output "本机审核后台：http://localhost:$port/admin"
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*'
    } |
    Select-Object -ExpandProperty IPAddress -Unique
foreach ($address in $addresses) {
    Write-Output "同一 Wi-Fi 用户端：http://${address}:$port"
}
if ($DatabaseProvider -eq 'sqlite') {
    Write-Output "数据：意图 $($state.counts.intents)，原始回答 $($state.counts.rawAnswers)，已发布 $($state.counts.published)，Q11 原始回答 $($state.counts.q11RawAnswers)"
} else {
    Write-Output '数据：PostgreSQL（问题数量由当前数据库动态决定）'
}
Write-Output "PID：$($process.Id)"
Write-Output "日志：$StdoutLog"
if ($OpenBrowser) { Start-Process "http://localhost:$port" }
