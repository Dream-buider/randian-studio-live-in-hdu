$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'output\freshman-mvp\server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Output '没有找到本地 MVP 的运行记录。'
    exit 0
}

$serverPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
$process = if ($serverPid) { Get-Process -Id $serverPid -ErrorAction SilentlyContinue } else { $null }
if ($process -and $process.ProcessName -eq 'node') {
    Stop-Process -Id $process.Id
    Write-Output "已停止本地 MVP（PID $($process.Id)）。"
} else {
    Write-Output '记录中的进程已不存在。'
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
