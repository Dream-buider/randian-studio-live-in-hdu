[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$ValidateOnly,
    [switch]$ResolveToolsOnly,
    [string]$RepoRootOverride = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = if ($RepoRootOverride) { [IO.Path]::GetFullPath($RepoRootOverride) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$RuntimeRoot = if ($env:LIVE_IN_HDU_RUNTIME_ROOT) { [IO.Path]::GetFullPath($env:LIVE_IN_HDU_RUNTIME_ROOT) } else { 'D:\Star\LIVE_IN_HDU_RUNTIME' }
$BackupRoot = Join-Path $RuntimeRoot 'backups'
$VendorRoot = Join-Path $RepoRoot 'vendor\WeKnora'
$VendorEnvironment = Join-Path $VendorRoot '.env'
$BaseCompose = Join-Path $VendorRoot 'docker-compose.yml'
$OverrideCompose = Join-Path $RepoRoot 'deploy\local\compose.weknora.override.yml'
$PlatformCompose = Join-Path $RepoRoot 'deploy\local\compose.platform.yml'
$PlatformEnvironment = Join-Path $RepoRoot 'deploy\local\.env.local'
$ApprovedManifest = Join-Path $RepoRoot 'output\freshman-platform\knowledge-manifest.json'
$RuntimeTooling = Join-Path $PSScriptRoot 'runtime-tooling.ps1'

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

function Import-LocalEnvironment([string]$PathValue) {
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
    }
}

function Compress-Sql([string]$InputPath, [string]$OutputPath) {
    $inputStream = [IO.File]::OpenRead($InputPath)
    try {
        $outputStream = [IO.File]::Create($OutputPath)
        try {
            $gzip = [IO.Compression.GZipStream]::new($outputStream, [IO.Compression.CompressionLevel]::Optimal)
            try { $inputStream.CopyTo($gzip) } finally { $gzip.Dispose() }
        } finally { $outputStream.Dispose() }
    } finally { $inputStream.Dispose() }
    Remove-Item -LiteralPath $InputPath -Force
}

if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        backupRoot = $BackupRoot
        manifest = (Join-Path $BackupRoot '<timestamp>\manifest.json')
        redactedConfig = (Join-Path $BackupRoot '<timestamp>\config.redacted.json')
        artifacts = @('live-in-hdu.sql.gz', 'weknora.sql.gz', 'weknora-data-files.tar.gz', 'approved-knowledge-manifest.json', 'config.redacted.json', 'manifest.json')
        retentionCount = 14
        deletesVolumes = $false
    } | ConvertTo-Json -Compress
    exit 0
}
if ($ResolveToolsOnly) {
    $dockerTool = Get-DockerTool
    [ordered]@{
        dockerInvoked = $false
        dockerCli = $dockerTool.Path
        dockerSource = $dockerTool.Source
        backupRoot = $BackupRoot
    } | ConvertTo-Json -Compress
    exit 0
}
if ([IO.Path]::GetPathRoot($BackupRoot).ToUpperInvariant() -ne 'D:\') { throw 'Knowledge backups must remain on D:.' }
if (
    -not (Test-Path -LiteralPath $VendorEnvironment) -or
    -not (Test-Path -LiteralPath $BaseCompose) -or
    -not (Test-Path -LiteralPath $PlatformEnvironment) -or
    -not (Test-Path -LiteralPath $PlatformCompose) -or
    -not (Test-Path -LiteralPath $ApprovedManifest)
) { throw 'Knowledge stack configuration is incomplete.' }
if ($ValidateOnly) { [ordered]@{ dockerInvoked = $false; backupRoot = $BackupRoot; validated = $true } | ConvertTo-Json -Compress; exit 0 }

$dockerTool = Get-DockerTool
$dockerCli = [string]$dockerTool.Path
Import-LocalEnvironment $PlatformEnvironment
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $BackupRoot "knowledge-$stamp"
$temporary = "$destination.partial"
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$compose = @('compose','--project-directory',$VendorRoot,'--env-file',$VendorEnvironment,'-f',$BaseCompose,'-f',$OverrideCompose,'--profile','searxng')
$businessCompose = @('compose','--project-name','live-in-hdu','--env-file',$PlatformEnvironment,'-f',$PlatformCompose)
$stopped = @()
try {
    foreach ($service in @('app','docreader')) {
        $state = (& $dockerCli @compose ps -q $service | Out-String).Trim()
        if ($state) { & $dockerCli @compose stop $service; if ($LASTEXITCODE -ne 0) { throw "Could not stop $service for backup" }; $stopped += $service }
    }
    $weknoraSql = Join-Path $temporary 'weknora.sql'
    & $dockerCli @compose exec -T postgres pg_dump -U weknora weknora | Set-Content -LiteralPath $weknoraSql -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'WeKnora pg_dump failed.' }
    Compress-Sql $weknoraSql (Join-Path $temporary 'weknora.sql.gz')
    $databaseUser = if ($env:LIVE_IN_HDU_DB_USER) { $env:LIVE_IN_HDU_DB_USER } else { 'live_in_hdu' }
    $databaseName = if ($env:LIVE_IN_HDU_DB_NAME) { $env:LIVE_IN_HDU_DB_NAME } else { 'live_in_hdu' }
    $businessSql = Join-Path $temporary 'live-in-hdu.sql'
    & $dockerCli @businessCompose exec -T live-in-hdu-db pg_dump -U $databaseUser $databaseName | Set-Content -LiteralPath $businessSql -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'LIVE IN HDU pg_dump failed.' }
    Compress-Sql $businessSql (Join-Path $temporary 'live-in-hdu.sql.gz')
    $appContainer = (& $dockerCli @compose ps -q app | Out-String).Trim()
    if (-not $appContainer) { throw 'WeKnora app container is unavailable; cannot locate data-files volume.' }
    $dataVolume = (& $dockerCli inspect --format '{{range .Mounts}}{{if eq .Destination "/data/files"}}{{.Name}}{{end}}{{end}}' $appContainer | Out-String).Trim()
    if (-not $dataVolume) { throw 'Could not resolve WeKnora data-files named volume.' }
    & $dockerCli run --rm `
        -v "${dataVolume}:/source:ro" `
        -v "${temporary}:/backup" `
        busybox:1.36 `
        tar -czf /backup/weknora-data-files.tar.gz -C /source .
    if ($LASTEXITCODE -ne 0) { throw 'WeKnora data-files archive failed.' }
    Copy-Item `
        -LiteralPath $ApprovedManifest `
        -Destination (Join-Path $temporary 'approved-knowledge-manifest.json')
    $redactedFiles = [ordered]@{}
    foreach ($configPath in @($VendorEnvironment, $PlatformEnvironment)) {
        $redactedFiles[[IO.Path]::GetFileName($configPath)] = (
            Get-Content -Raw -LiteralPath $configPath -Encoding UTF8 -ErrorAction Stop
        ) -replace '(?m)^([^#\r\n]*(?:PASSWORD|SECRET|KEY|TOKEN)[^=]*=).*$', '$1[REDACTED]'
    }
    $redactedFiles | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $temporary 'config.redacted.json') -Encoding UTF8
    $hashes = Get-ChildItem -LiteralPath $temporary -Recurse -File | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($temporary.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } }
    [ordered]@{ createdAt = [DateTime]::UtcNow.ToString('o'); hashes = $hashes } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $temporary 'manifest.json') -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $destination
    Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter 'knowledge-*' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force
} finally {
    foreach ($service in $stopped) { & $dockerCli @compose up -d $service | Out-Null }
}
$healthDeadline = [DateTime]::UtcNow.AddMinutes(2)
$weknoraRecovered = $false
while ([DateTime]::UtcNow -lt $healthDeadline) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 3
        if ($null -ne $health) {
            $weknoraRecovered = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $weknoraRecovered) {
    throw 'Backup files were created, but WeKnora did not recover after the consistent snapshot.'
}
Write-Output $destination
