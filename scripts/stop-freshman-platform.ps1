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
$ExpectedDefaultDatabase = Join-Path $ExpectedAppRoot 'runtime\live-in-hdu.db'

function Get-NormalizedPath([string]$PathValue) {
    return [IO.Path]::GetFullPath($PathValue).TrimEnd('\').Replace('/', '\')
}

function Test-ExactCommandArgument([string]$CommandLine, [string]$ExpectedArgument) {
    $normalized = $CommandLine.Replace('/', '\')
    $escaped = [regex]::Escape((Get-NormalizedPath $ExpectedArgument))
    return $normalized -match "(?i)(?:^|[\s`"])$escaped(?=$|[\s`"])"
}

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
    (Get-NormalizedPath ([string]$metadata.appRoot)) -ine (Get-NormalizedPath $ExpectedAppRoot) -or
    (Get-NormalizedPath ([string]$metadata.entrypoint)) -ine (Get-NormalizedPath $ExpectedEntrypoint)
) {
    throw 'PID metadata does not describe this workspace; refusing to stop anything.'
}
$metadataPort = [int]$metadata.port
if ($metadataPort -lt 1 -or $metadataPort -gt 65535) {
    throw 'PID metadata has an invalid port; refusing to stop anything.'
}
$metadataDatabase = Get-NormalizedPath ([string]$metadata.database)
if ($metadataDatabase -ieq (Get-NormalizedPath $ExpectedDefaultDatabase)) {
    $runtimeItem = Get-Item -LiteralPath (Join-Path $ExpectedAppRoot 'runtime') -Force
    $runtimeTarget = [string]($runtimeItem.Target | Select-Object -First 1)
    if (
        $runtimeItem.LinkType -notin @('Junction', 'SymbolicLink') -or
        [IO.Path]::GetPathRoot($runtimeTarget).ToUpperInvariant() -ne 'D:\'
    ) {
        throw 'Default runtime metadata is not backed by the approved D: junction.'
    }
} elseif ([IO.Path]::GetPathRoot($metadataDatabase).ToUpperInvariant() -ne 'D:\') {
    throw 'PID metadata database must be the approved runtime path or an explicit D: override.'
}

$process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Output '服务已经停止；已清理过期 PID 记录。'
    exit 0
}

$commandLine = [string]$process.CommandLine
if (-not (Test-ExactCommandArgument $commandLine $ExpectedEntrypoint)) {
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
