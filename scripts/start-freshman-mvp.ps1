param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'apps\freshman-mvp'
$server = Join-Path $appRoot 'server.mjs'
$runtimeDir = Join-Path $projectRoot 'output\freshman-mvp'
$pidFile = Join-Path $runtimeDir 'server.pid'
$stdout = Join-Path $runtimeDir 'server.log'
$stderr = Join-Path $runtimeDir 'server.error.log'
$envFile = Join-Path $appRoot '.env.local'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
}

$port = if ($env:PORT) { [int]$env:PORT } else { 3210 }

if (Test-Path -LiteralPath $pidFile) {
    $existingPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        Write-Output "服务已经运行：http://localhost:$port"
        if (-not $NoBrowser) { Start-Process "http://localhost:$port" }
        exit 0
    }
}

$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $appRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 1
        if ($health.ok) { $ready = $true; break }
    } catch { }
}

if (-not $ready) {
    throw "服务未能启动，请查看 $stderr"
}

Write-Output "问答页：http://localhost:$port"
Write-Output "审核后台：http://localhost:$port/admin"
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique
foreach ($address in $addresses) {
    Write-Output "手机同一 Wi-Fi：http://${address}:$port"
}
Write-Output "日志：$stdout"

if (-not $NoBrowser) { Start-Process "http://localhost:$port" }
