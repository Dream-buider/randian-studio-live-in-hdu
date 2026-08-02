[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$ValidateOnly,
    [string]$RepoRootOverride = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = if ($RepoRootOverride) { [IO.Path]::GetFullPath($RepoRootOverride) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$RuntimeRoot = if ($env:LIVE_IN_HDU_RUNTIME_ROOT) { [IO.Path]::GetFullPath($env:LIVE_IN_HDU_RUNTIME_ROOT) } else { 'D:\Star\LIVE_IN_HDU_RUNTIME' }
$StartScript = Join-Path $RepoRoot 'scripts\start-knowledge-stack.ps1'
$PlatformTestScript = Join-Path $RepoRoot 'scripts\test-freshman-platform.ps1'
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'

if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        runtimeRoot = $RuntimeRoot
        startOrder = @('business-postgres', 'weknora-and-searxng', 'gateway')
        verification = @('backend-tests', 'web-tests', 'legacy-regression', 'production-build', 'secret-scan', 'live-health')
        components = [ordered]@{ businessPostgres = 'preflight-required'; weknora = 'preflight-required'; searxng = 'preflight-required'; gateway = 'preflight-required' }
    } | ConvertTo-Json -Compress
    exit 0
}

& $StartScript -ValidateOnly -RepoRootOverride $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'Knowledge stack static validation failed.' }
if ($ValidateOnly) {
    [ordered]@{ dockerInvoked = $false; validated = $true; runtimeRoot = $RuntimeRoot } | ConvertTo-Json -Compress
    exit 0
}

$env:TEMP = Join-Path $RuntimeRoot 'temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $RuntimeRoot 'npm-cache'
New-Item -ItemType Directory -Force -Path $env:TEMP, $env:npm_config_cache | Out-Null
& npm --prefix $AppRoot test
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
& npm --prefix $AppRoot run test:web
if ($LASTEXITCODE -ne 0) { throw 'Web tests failed.' }
& npm --prefix $RepoRoot run test:mvp
if ($LASTEXITCODE -ne 0) { throw 'Legacy MVP regression failed.' }
& npm --prefix $AppRoot run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
& $PlatformTestScript -SecretScanOnly
if ($LASTEXITCODE -ne 0) { throw 'Secret scan failed.' }

$checks = [ordered]@{}
foreach ($check in @(
    @{ name = 'weknora'; url = 'http://127.0.0.1:8080/health' },
    @{ name = 'searxng'; url = 'http://127.0.0.1:8888/search?q=health&format=json' },
    @{ name = 'gateway'; url = 'http://127.0.0.1:3210/api/health' }
)) {
    try {
        $null = Invoke-RestMethod -Uri $check.url -TimeoutSec 5
        $checks[$check.name] = 'ok'
    } catch {
        $checks[$check.name] = 'unavailable'
    }
}
[ordered]@{ dockerInvoked = $true; components = $checks } | ConvertTo-Json -Compress
if ($checks.Values -contains 'unavailable') { exit 2 }
