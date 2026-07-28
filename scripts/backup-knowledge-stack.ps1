[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$ValidateOnly,
    [string]$RepoRootOverride = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = if ($RepoRootOverride) { [IO.Path]::GetFullPath($RepoRootOverride) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$RuntimeRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$BackupRoot = Join-Path $RuntimeRoot 'backups'
$VendorRoot = Join-Path $RepoRoot 'vendor\WeKnora'
$VendorEnvironment = Join-Path $VendorRoot '.env'
$BaseCompose = Join-Path $VendorRoot 'docker-compose.yml'
$OverrideCompose = Join-Path $RepoRoot 'deploy\local\compose.weknora.override.yml'

if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        backupRoot = $BackupRoot
        manifest = (Join-Path $BackupRoot '<timestamp>\manifest.json')
        redactedConfig = (Join-Path $BackupRoot '<timestamp>\config.redacted.json')
        retentionDays = 14
        deletesVolumes = $false
    } | ConvertTo-Json -Compress
    exit 0
}
if ([IO.Path]::GetPathRoot($BackupRoot).ToUpperInvariant() -ne 'D:\') { throw 'Knowledge backups must remain on D:.' }
if (-not (Test-Path -LiteralPath $VendorEnvironment) -or -not (Test-Path -LiteralPath $BaseCompose)) { throw 'Knowledge stack configuration is incomplete.' }
if ($ValidateOnly) { [ordered]@{ dockerInvoked = $false; backupRoot = $BackupRoot; validated = $true } | ConvertTo-Json -Compress; exit 0 }

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $BackupRoot "knowledge-$stamp"
$temporary = "$destination.partial"
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$compose = @('compose','--project-directory',$VendorRoot,'--env-file',$VendorEnvironment,'-f',$BaseCompose,'-f',$OverrideCompose,'--profile','searxng')
$stopped = @()
try {
    foreach ($service in @('app','docreader')) {
        $state = (& docker @compose ps -q $service | Out-String).Trim()
        if ($state) { & docker @compose stop $service; if ($LASTEXITCODE -ne 0) { throw "Could not stop $service for backup" }; $stopped += $service }
    }
    & docker @compose exec -T postgres pg_dump -U weknora weknora | Set-Content -LiteralPath (Join-Path $temporary 'weknora.sql') -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'WeKnora pg_dump failed.' }
    & docker @compose exec -T postgres pg_dump -U live_in_hdu live_in_hdu | Set-Content -LiteralPath (Join-Path $temporary 'live-in-hdu.sql') -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw 'LIVE IN HDU pg_dump failed.' }
    $dataFiles = Join-Path $RuntimeRoot 'weknora\data-files'
    if (Test-Path -LiteralPath $dataFiles) { Copy-Item -LiteralPath $dataFiles -Destination (Join-Path $temporary 'weknora-data-files') -Recurse -Force }
    $redacted = Get-Content -Raw -LiteralPath $VendorEnvironment -Encoding UTF8 -ErrorAction Stop -replace '(?m)^(.*(?:PASSWORD|SECRET|KEY|TOKEN)=).*$', '$1[REDACTED]'
    Set-Content -LiteralPath (Join-Path $temporary 'config.redacted.json') -Value ($redacted | ConvertTo-Json) -Encoding UTF8
    $hashes = Get-ChildItem -LiteralPath $temporary -Recurse -File | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($temporary.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } }
    [ordered]@{ createdAt = [DateTime]::UtcNow.ToString('o'); hashes = $hashes } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $temporary 'manifest.json') -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $destination
    Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter 'knowledge-*' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force
} finally {
    foreach ($service in $stopped) { & docker @compose up -d $service | Out-Null }
}
Write-Output $destination
