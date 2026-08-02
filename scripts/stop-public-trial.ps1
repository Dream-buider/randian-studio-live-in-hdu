[CmdletBinding()]
param([switch]$StaticOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$RuntimeRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$TrialRoot = Join-Path $RuntimeRoot 'public-trial'
$PidFile = Join-Path $TrialRoot 'gateway.pid.json'
$Entrypoint = Join-Path $AppRoot 'dist\public-trial\index.js'
$CpolarExe = Join-Path $TrialRoot 'cpolar\cpolar.exe'
$CpolarPidFile = Join-Path $TrialRoot 'cpolar.pid.json'

if ($StaticOnly) {
    [ordered]@{
        mode = 'static'
        runtimeRoot = $RuntimeRoot
        pidFile = $PidFile
        processStarted = $false
        firewallMutation = $false
    } | ConvertTo-Json -Compress
    exit 0
}

function Get-NormalizedPath([string]$PathValue) {
    return [IO.Path]::GetFullPath($PathValue).TrimEnd('\').Replace('/', '\')
}

function Test-ExactCommandArgument([string]$CommandLine, [string]$ExpectedArgument) {
    $normalized = $CommandLine.Replace('/', '\')
    $escaped = [regex]::Escape((Get-NormalizedPath $ExpectedArgument))
    return $normalized -match "(?i)(?:^|[\s`"])$escaped(?=$|[\s`"])"
}

function Test-ExactParsedCommandArgument([string]$CommandLine, [string]$ExpectedArgument) {
    $expected = Get-NormalizedPath $ExpectedArgument
    $arguments = [regex]::Matches($CommandLine, '(?:"([^"]*)"|(\S+))')
    foreach ($match in $arguments) {
        $value = if ($match.Groups[1].Success) {
            $match.Groups[1].Value
        } else {
            $match.Groups[2].Value
        }
        try {
            if ((Get-NormalizedPath $value) -ieq $expected) { return $true }
        } catch {
            # Non-path command arguments are not ownership evidence.
        }
    }
    return $false
}

if (Test-Path -LiteralPath $CpolarPidFile -PathType Leaf) {
    try {
        $cpolarMetadata = Get-Content -Raw -LiteralPath $CpolarPidFile -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "cpolar PID 文件损坏，请人工检查：$CpolarPidFile"
    }
    if (
        [int]$cpolarMetadata.pid -le 0 -or
        (Get-NormalizedPath ([string]$cpolarMetadata.executable)) -ine (Get-NormalizedPath $CpolarExe) -or
        [string]$cpolarMetadata.tunnel -ne 'live-in-hdu-trial'
    ) {
        throw 'cpolar PID 元数据不属于当前隧道，拒绝停止任何进程。'
    }
    $cpolarProcess = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $([int]$cpolarMetadata.pid)" `
        -ErrorAction SilentlyContinue
    if ($cpolarProcess) {
        if (
            -not (Test-ExactParsedCommandArgument ([string]$cpolarProcess.CommandLine) $CpolarExe) -or
            ([string]$cpolarProcess.CommandLine) -notmatch 'live-in-hdu-trial'
        ) {
            throw 'cpolar PID 属于其他进程，拒绝停止。'
        }
        Stop-Process -Id ([int]$cpolarMetadata.pid) -Force
        Wait-Process -Id ([int]$cpolarMetadata.pid) -Timeout 10 -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $CpolarPidFile -Force
    Write-Output 'cpolar 团队内测隧道已停止。'
}

if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
    Write-Output '公网内测网关未运行；日志、配置和分享文件均已保留。'
    exit 0
}
try {
    $metadata = Get-Content -Raw -LiteralPath $PidFile -Encoding UTF8 | ConvertFrom-Json
} catch {
    throw "公网网关 PID 文件损坏，请人工检查：$PidFile"
}
if (
    [int]$metadata.pid -le 0 -or
    [int]$metadata.port -ne 3211 -or
    (Get-NormalizedPath ([string]$metadata.entrypoint)) -ine (Get-NormalizedPath $Entrypoint)
) {
    throw '公网网关 PID 元数据不属于当前实例，拒绝停止任何进程。'
}
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$metadata.pid)" -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Output '已清理失效的公网网关 PID 记录；日志和配置均已保留。'
    exit 0
}
if (-not (Test-ExactParsedCommandArgument ([string]$process.CommandLine) $Entrypoint)) {
    throw 'PID 属于其他进程，拒绝停止。'
}
Stop-Process -Id ([int]$metadata.pid) -Force
Wait-Process -Id ([int]$metadata.pid) -Timeout 10 -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PidFile -Force
Write-Output '公网内测网关已停止；3210 完整服务、日志、配置和数据均已保留。'
