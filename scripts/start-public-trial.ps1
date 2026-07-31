[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [int]$HealthTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$RuntimeRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$TrialRoot = Join-Path $RuntimeRoot 'public-trial'
$LogsRoot = Join-Path $TrialRoot 'logs'
$CpolarRoot = Join-Path $TrialRoot 'cpolar'
$ArtifactsRoot = Join-Path $TrialRoot 'artifacts'
$TempRoot = Join-Path $RuntimeRoot 'temp'
$NpmCache = Join-Path $RuntimeRoot 'npm-cache'
$PidFile = Join-Path $TrialRoot 'gateway.pid.json'
$StdoutLog = Join-Path $LogsRoot 'gateway.stdout.log'
$StderrLog = Join-Path $LogsRoot 'gateway.stderr.log'
$StdinFile = Join-Path $TrialRoot 'gateway.stdin.txt'
$EnvFile = Join-Path $AppRoot '.env.local'
$Entrypoint = Join-Path $AppRoot 'dist\public-trial\index.js'
$HostAddress = '127.0.0.1'
$Port = 3211

if ($StaticOnly) {
    [ordered]@{
        mode = 'static'
        runtimeRoot = $RuntimeRoot
        host = $HostAddress
        port = $Port
        entrypoint = $Entrypoint
        processStarted = $false
        firewallMutation = $false
    } | ConvertTo-Json -Compress
    exit 0
}

function Import-LocalEnvironment([string]$PathValue) {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) { return }
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
            continue
        }
        $parts = $trimmed.Split('=', 2)
        $name = $parts[0].Trim()
        if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
            throw 'Invalid environment variable name in .env.local.'
        }
        $value = $parts[1].Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Get-NormalizedPath([string]$PathValue) {
    return [IO.Path]::GetFullPath($PathValue).TrimEnd('\').Replace('/', '\')
}

function Test-ExactCommandArgument([string]$CommandLine, [string]$ExpectedArgument) {
    $normalized = $CommandLine.Replace('/', '\')
    $escaped = [regex]::Escape((Get-NormalizedPath $ExpectedArgument))
    return $normalized -match "(?i)(?:^|[\s`"])$escaped(?=$|[\s`"])"
}

function Get-OwnedProcess([int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if (-not (Test-ExactCommandArgument ([string]$process.CommandLine) $Entrypoint)) {
        return $null
    }
    return $process
}

if ([IO.Path]::GetPathRoot($TrialRoot).ToUpperInvariant() -ne 'D:\') {
    throw 'Public trial runtime must remain on D:.'
}
New-Item -ItemType Directory -Path @(
    $TrialRoot, $LogsRoot, $CpolarRoot, $ArtifactsRoot, $TempRoot, $NpmCache
) -Force | Out-Null

Import-LocalEnvironment $EnvFile
$env:PUBLIC_TRIAL_HOST = $HostAddress
$env:PUBLIC_TRIAL_PORT = [string]$Port
$env:PUBLIC_TRIAL_UPSTREAM = 'http://127.0.0.1:3210'
$env:PUBLIC_TRIAL_RUNTIME_DIR = $TrialRoot
$env:TEMP = $TempRoot
$env:TMP = $TempRoot
$env:npm_config_cache = $NpmCache
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_TRIAL_ACCESS_CODE) -or $env:PUBLIC_TRIAL_ACCESS_CODE.Length -lt 8) {
    throw '请先在 apps\freshman-mvp\.env.local 中设置至少 8 位的 PUBLIC_TRIAL_ACCESS_CODE。'
}
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_TRIAL_SESSION_SECRET) -or $env:PUBLIC_TRIAL_SESSION_SECRET.Length -lt 32) {
    throw '请先在 apps\freshman-mvp\.env.local 中设置至少 32 位的 PUBLIC_TRIAL_SESSION_SECRET。'
}

try {
    $privateHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:3210/api/health' -TimeoutSec 5
} catch {
    throw '本机完整服务 3210 尚未运行；请先启动知识库服务。'
}
if ($privateHealth.status -ne 'ok') {
    throw '本机完整服务 3210 当前不健康，未启动公网入口。'
}

if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    try {
        $metadata = Get-Content -Raw -LiteralPath $PidFile -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "公网网关 PID 文件损坏，请人工检查：$PidFile"
    }
    if (
        [int]$metadata.pid -le 0 -or
        (Get-NormalizedPath ([string]$metadata.entrypoint)) -ine (Get-NormalizedPath $Entrypoint) -or
        [int]$metadata.port -ne $Port
    ) {
        throw '公网网关 PID 元数据不属于当前实例，拒绝覆盖。'
    }
    $owned = Get-OwnedProcess ([int]$metadata.pid)
    if ($owned) {
        Write-Output "公网内测网关已在运行：http://${HostAddress}:$Port"
        exit 0
    }
    if (Get-Process -Id ([int]$metadata.pid) -ErrorAction SilentlyContinue) {
        throw 'PID 已被其他进程占用，拒绝覆盖。'
    }
    Remove-Item -LiteralPath $PidFile -Force
}

& npm --prefix $AppRoot run build
if ($LASTEXITCODE -ne 0) { throw '服务端构建失败。' }
& npm --prefix $AppRoot run build:trial
if ($LASTEXITCODE -ne 0) { throw '公网用户端构建失败。' }
if (-not (Test-Path -LiteralPath $Entrypoint -PathType Leaf)) {
    throw "公网网关入口文件不存在：$Entrypoint"
}

$node = (Get-Command node -ErrorAction Stop).Source
Remove-Item -LiteralPath $StdoutLog, $StderrLog -Force -ErrorAction SilentlyContinue
[IO.File]::WriteAllText($StdinFile, '', [Text.UTF8Encoding]::new($false))
$process = Start-Process `
    -FilePath $node `
    -ArgumentList @(
        '--preserve-symlinks',
        '--preserve-symlinks-main',
        "`"$Entrypoint`""
    ) `
    -WorkingDirectory $AppRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardInput $StdinFile `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog

$metadata = [ordered]@{
    pid = $process.Id
    startedAt = [DateTime]::UtcNow.ToString('o')
    entrypoint = $Entrypoint
    port = $Port
    runtimeRoot = $TrialRoot
    nodeExecutable = $node
}
[IO.File]::WriteAllText(
    $PidFile,
    ($metadata | ConvertTo-Json -Depth 3),
    [Text.UTF8Encoding]::new($false)
)

$deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
$ready = $false
$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(2)
try {
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) { break }
        try {
            $response = $client.GetAsync("http://${HostAddress}:$Port/").GetAwaiter().GetResult()
            try {
                if ([int]$response.StatusCode -eq 302) {
                    $ready = $true
                    break
                }
            } finally {
                $response.Dispose()
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
} finally {
    $client.Dispose()
    $handler.Dispose()
}
if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    $diagnostics = if (Test-Path -LiteralPath $StderrLog) {
        Get-Content -LiteralPath $StderrLog -Tail 20
    } else { @() }
    throw "公网网关启动检查失败。日志：$StderrLog`n$($diagnostics -join [Environment]::NewLine)"
}

Write-Output "公网内测网关：http://${HostAddress}:$Port"
Write-Output "PID：$($process.Id)"
Write-Output "日志：$LogsRoot"
exit 0
