param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$localPort = 3211
$adminUrl = "http://127.0.0.1:$localPort/admin"
$reviewUrl = "http://127.0.0.1:$localPort/api/reviews"

function Test-AdminTunnel {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $reviewUrl -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-AdminTunnel)) {
  $listener = Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "本机端口 $localPort 已被其他程序占用，请关闭该程序后重试。"
  }

  $ssh = (Get-Command ssh -ErrorAction Stop).Source
  Start-Process -FilePath $ssh -ArgumentList @(
    '-N',
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-L', "$localPort`:127.0.0.1:3212",
    'ubuntu@124.222.171.40'
  ) -WindowStyle Hidden | Out-Null

  $ready = $false
  foreach ($attempt in 1..10) {
    Start-Sleep -Milliseconds 500
    if (Test-AdminTunnel) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw '无法建立管理端安全通道。请确认电脑可以联网，并且 SSH 公钥仍然有效。'
  }
}

Write-Host "管理端安全通道已就绪：$adminUrl" -ForegroundColor Green
if (-not $NoBrowser) {
  Start-Process $adminUrl
}
