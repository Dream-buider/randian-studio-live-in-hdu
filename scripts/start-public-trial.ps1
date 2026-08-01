[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$StartTunnel,
    [string]$KnownPublicUrl = '',
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
$CpolarExe = Join-Path $CpolarRoot 'cpolar.exe'
$CpolarConfig = Join-Path $CpolarRoot 'cpolar.yml'
$CpolarConfigArgument = "-config=$(Join-Path $CpolarRoot 'cpolar.yml')"
$CpolarPidFile = Join-Path $TrialRoot 'cpolar.pid.json'
$CpolarStdout = Join-Path $LogsRoot 'cpolar.stdout.log'
$CpolarStderr = Join-Path $LogsRoot 'cpolar.stderr.log'
$CpolarLog = Join-Path $LogsRoot 'cpolar.log'
$PublicUrlFile = Join-Path $TrialRoot 'public-trial-url.txt'
$QrScript = Join-Path $AppRoot 'scripts\generate-public-trial-qr.mts'
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

function Get-OwnedProcess([int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if (-not (Test-ExactParsedCommandArgument ([string]$process.CommandLine) $Entrypoint)) {
        return $null
    }
    return $process
}

function Get-CpolarHttpProxy([string]$PathValue) {
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        if ($line -notmatch '^\s*http_proxy\s*:\s*(\S+)\s*$') { continue }
        try {
            $uri = [Uri]$Matches[1]
        } catch {
            throw 'cpolar 配置中的 HTTP 代理地址无效。'
        }
        if ($uri.Scheme -ne 'http' -or -not $uri.IsLoopback) {
            throw 'cpolar 仅允许使用本机 HTTP 代理。'
        }
        return $uri
    }
    return $null
}

function Test-CpolarPublicUrl([string]$UrlValue) {
    if ([string]::IsNullOrWhiteSpace($UrlValue)) { return $false }
    try {
        $uri = [Uri]$UrlValue
    } catch {
        return $false
    }
    return (
        $uri.Scheme -eq 'https' -and
        $uri.AbsolutePath -eq '/' -and
        $uri.DnsSafeHost -match '(^|\.)cpolar\.(cn|top|io|com)$'
    )
}

function Test-PublicTrialUrl([string]$UrlValue, [Uri]$ProxyUri) {
    if (-not (Test-CpolarPublicUrl $UrlValue)) { return $false }
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    if ($ProxyUri) {
        $handler.UseProxy = $true
        $handler.Proxy = [Net.WebProxy]::new($ProxyUri)
    }
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(4)
    try {
        $response = $client.GetAsync($UrlValue).GetAwaiter().GetResult()
        try {
            return (
                [int]$response.StatusCode -eq 302 -and
                [string]$response.Headers.Location.OriginalString -eq '/trial/login'
            )
        } finally {
            $response.Dispose()
        }
    } catch {
        return $false
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
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

$gatewayAlreadyRunning = $false
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
        $process = Get-Process -Id ([int]$metadata.pid)
        $gatewayAlreadyRunning = $true
        if (-not $StartTunnel) {
            Write-Output "公网内测网关已在运行：http://${HostAddress}:$Port"
            exit 0
        }
    }
    elseif (Get-Process -Id ([int]$metadata.pid) -ErrorAction SilentlyContinue) {
        throw 'PID 已被其他进程占用，拒绝覆盖。'
    }
    else {
        Remove-Item -LiteralPath $PidFile -Force
    }
}

if (-not $gatewayAlreadyRunning) {
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
}

Write-Output "公网内测网关：http://${HostAddress}:$Port"
Write-Output "PID：$($process.Id)"
Write-Output "日志：$LogsRoot"
if ($StartTunnel) {
    $existingTunnel = $null
    if (-not (Test-Path -LiteralPath $CpolarExe -PathType Leaf)) {
        throw "cpolar 程序不存在：$CpolarExe"
    }
    if (-not (Test-Path -LiteralPath $CpolarConfig -PathType Leaf)) {
        throw 'cpolar 尚未配置；请先复制 authtoken 并运行配置脚本。'
    }
    $cpolarProxy = Get-CpolarHttpProxy $CpolarConfig
    $publicUrlCandidates = [Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($KnownPublicUrl)) {
        $publicUrlCandidates.Add($KnownPublicUrl.Trim())
    }
    if (Test-Path -LiteralPath $PublicUrlFile -PathType Leaf) {
        $publicUrlCandidates.Add((Get-Content -Raw -LiteralPath $PublicUrlFile -Encoding UTF8).Trim())
    }
    if (Test-Path -LiteralPath $CpolarPidFile -PathType Leaf) {
        $cpolarMetadata = Get-Content -Raw -LiteralPath $CpolarPidFile -Encoding UTF8 | ConvertFrom-Json
        $existingTunnel = Get-CimInstance Win32_Process `
            -Filter "ProcessId = $([int]$cpolarMetadata.pid)" `
            -ErrorAction SilentlyContinue
        if ($existingTunnel) {
            $commandLine = [string]$existingTunnel.CommandLine
            if (
                -not (Test-ExactParsedCommandArgument $commandLine $CpolarExe) -or
                $commandLine -notmatch 'live-in-hdu-trial'
            ) {
                throw 'cpolar PID 属于其他进程，拒绝复用。'
            }
        } else {
            Remove-Item -LiteralPath $CpolarPidFile -Force
        }
    }
    if (-not $existingTunnel) {
        Remove-Item -LiteralPath $CpolarStdout, $CpolarStderr, $CpolarLog -Force -ErrorAction SilentlyContinue
        $tunnel = Start-Process `
            -FilePath $CpolarExe `
            -ArgumentList @(
                'start',
                $CpolarConfigArgument,
                'live-in-hdu-trial'
            ) `
            -WorkingDirectory $CpolarRoot `
            -PassThru `
            -WindowStyle Hidden `
            -RedirectStandardOutput $CpolarStdout `
            -RedirectStandardError $CpolarStderr
        [IO.File]::WriteAllText(
            $CpolarPidFile,
            ([ordered]@{
                pid = $tunnel.Id
                startedAt = [DateTime]::UtcNow.ToString('o')
                executable = $CpolarExe
                config = $CpolarConfig
                tunnel = 'live-in-hdu-trial'
            } | ConvertTo-Json),
            [Text.UTF8Encoding]::new($false)
        )
    } else {
        $tunnel = Get-Process -Id ([int]$cpolarMetadata.pid)
    }
    $urlDeadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
    $publicUrl = ''
    while ([DateTime]::UtcNow -lt $urlDeadline) {
        if ($tunnel.HasExited) { break }
        $logText = @($CpolarStdout, $CpolarStderr, $CpolarLog) |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            ForEach-Object { Get-Content -Raw -LiteralPath $_ -Encoding UTF8 -ErrorAction SilentlyContinue } |
            Out-String
        foreach ($match in [regex]::Matches($logText, 'https://[A-Za-z0-9.-]+(?::\d+)?')) {
            $publicUrlCandidates.Add($match.Value.TrimEnd('/'))
        }
        foreach ($candidate in $publicUrlCandidates | Select-Object -Unique) {
            if (Test-PublicTrialUrl $candidate $cpolarProxy) {
                $publicUrl = $candidate.TrimEnd('/')
                break
            }
        }
        if ($publicUrl) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl.StartsWith('https://')) {
        if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
        Remove-Item -LiteralPath $CpolarPidFile -Force -ErrorAction SilentlyContinue
        throw "未获得 cpolar HTTPS 地址，请检查：$CpolarStderr"
    }
    [IO.File]::WriteAllText($PublicUrlFile, $publicUrl, [Text.UTF8Encoding]::new($false))
    & npm --prefix $AppRoot exec -- tsx $QrScript --url $publicUrl
    if ($LASTEXITCODE -ne 0) { throw '公网二维码生成失败。' }
    Write-Output "团队公网地址：$publicUrl"
    Write-Output "二维码：$(Join-Path $ArtifactsRoot 'public-trial-qr.png')"
}
exit 0
