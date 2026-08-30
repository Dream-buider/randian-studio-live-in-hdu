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
    throw "Local port $localPort is already in use. Stop the conflicting process and retry."
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
    throw 'Unable to establish the admin SSH tunnel. Check network access and the SSH public key.'
  }
}

Write-Host "Admin SSH tunnel is ready: $adminUrl" -ForegroundColor Green
if (-not $NoBrowser) {
  Start-Process $adminUrl
}
