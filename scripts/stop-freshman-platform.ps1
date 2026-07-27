param(
    [int]$TimeoutSeconds = 10,
    [string]$InstanceName = 'platform'
)

$ErrorActionPreference = 'Stop'
if ($InstanceName -notmatch '^[a-z0-9-]+$') {
    throw 'InstanceName may contain only lowercase letters, numbers, and hyphens.'
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutputRoot = Join-Path $RepoRoot 'output\freshman-platform'
$InstanceOutput = if ($InstanceName -eq 'platform') {
    $OutputRoot
} else {
    Join-Path $OutputRoot $InstanceName
}
$PidFile = Join-Path $InstanceOutput 'platform.pid.json'
$ExpectedAppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$ExpectedEntrypoint = Join-Path $ExpectedAppRoot 'dist\server\index.js'

if (-not (Test-Path -LiteralPath $PidFile)) {
    Write-Output '服务已经停止。'
    exit 0
}

try {
    $metadata = Get-Content -Raw -LiteralPath $PidFile | ConvertFrom-Json
} catch {
    throw "PID metadata is invalid; refusing to stop anything: $PidFile"
}

$pidValue = [int]$metadata.pid
if ($pidValue -le 0) {
    throw "PID metadata does not contain a valid PID: $PidFile"
}
if (
    [string]$metadata.appRoot -ne $ExpectedAppRoot -or
    [string]$metadata.entrypoint -ne $ExpectedEntrypoint
) {
    throw 'PID metadata does not describe this workspace; refusing to stop anything.'
}

$process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Output '服务已经停止；已清理过期 PID 记录。'
    exit 0
}

$commandLine = [string]$process.CommandLine
if (
    -not $commandLine.Contains($ExpectedEntrypoint, [StringComparison]::OrdinalIgnoreCase) -and
    -not $commandLine.Contains('dist/server/index.js', [StringComparison]::OrdinalIgnoreCase) -and
    -not $commandLine.Contains('dist\server\index.js', [StringComparison]::OrdinalIgnoreCase)
) {
    throw "PID $pidValue belongs to another command; refusing to stop it."
}

Stop-Process -Id $pidValue
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $PidFile -Force
        Write-Output "服务已停止（PID $pidValue）。"
        exit 0
    }
    Start-Sleep -Milliseconds 200
}
throw "PID $pidValue did not exit within $TimeoutSeconds seconds; PID record was retained."
