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

if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        runtimeRoot = $RuntimeRoot
        startOrder = @('postgres', 'weknora-and-searxng', 'gateway')
        components = [ordered]@{ postgres = 'preflight-required'; weknora = 'preflight-required'; searxng = 'preflight-required'; gateway = 'preflight-required' }
    } | ConvertTo-Json -Compress
    exit 0
}

& $StartScript -ValidateOnly -RepoRootOverride $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'Knowledge stack static validation failed.' }
if ($ValidateOnly) {
    [ordered]@{ dockerInvoked = $false; validated = $true; runtimeRoot = $RuntimeRoot } | ConvertTo-Json -Compress
    exit 0
}

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
