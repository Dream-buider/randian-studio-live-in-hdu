[CmdletBinding()]
param(
    [switch]$TokenFromClipboard,
    [string]$HttpProxy = '',
    [switch]$StaticOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RuntimeRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$TrialRoot = Join-Path $RuntimeRoot 'public-trial'
$CpolarRoot = Join-Path $TrialRoot 'cpolar'
$LogsRoot = Join-Path $TrialRoot 'logs'
$ConfigPath = Join-Path $CpolarRoot 'cpolar.yml'

if ($StaticOnly) {
    [ordered]@{
        mode = 'static'
        runtimeRoot = $RuntimeRoot
        configPath = $ConfigPath
        processStarted = $false
        firewallMutation = $false
    } | ConvertTo-Json -Compress
    exit 0
}
if (-not $TokenFromClipboard) {
    throw '请先在 cpolar 控制台复制 authtoken，然后使用 -TokenFromClipboard。'
}

Add-Type -AssemblyName System.Windows.Forms
$token = (& powershell.exe -NoProfile -STA -Command `
    "Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::GetText()" | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
    throw '剪贴板中没有 cpolar authtoken。'
}
if ($token.Contains("`r") -or $token.Contains("`n")) {
    throw 'cpolar authtoken 必须是单行文本。'
}
if ($token -notmatch '^[A-Za-z0-9_-]{16,256}$') {
    throw '剪贴板内容不像有效的 cpolar authtoken，未写入配置。'
}
if ([IO.Path]::GetPathRoot($ConfigPath).ToUpperInvariant() -ne 'D:\') {
    throw 'cpolar 配置必须位于 D:。'
}
$proxyYaml = ''
if (-not [string]::IsNullOrWhiteSpace($HttpProxy)) {
    try {
        $proxyUri = [Uri]$HttpProxy
    } catch {
        throw 'cpolar HTTP 代理地址格式无效。'
    }
    if ($proxyUri.Scheme -ne 'http' -or -not $proxyUri.IsLoopback) {
        throw 'cpolar HTTP 代理仅允许本机 http://127.0.0.1 或 localhost 地址。'
    }
    $proxyYaml = "http_proxy: $($proxyUri.AbsoluteUri.TrimEnd('/'))`n"
}
New-Item -ItemType Directory -Path $CpolarRoot, $LogsRoot -Force | Out-Null
$yaml = @"
authtoken: $token
console_ui: false
${proxyYaml}inspect_db_size: -1
log_level: info
log_format: json
log: D:/Star/LIVE_IN_HDU_RUNTIME/public-trial/logs/cpolar.log
web_addr: 127.0.0.1:4040
tunnels:
  live-in-hdu-trial:
    addr: 3211
    proto: http
    region: cn
    inspect: false
"@
try {
    [IO.File]::WriteAllText($ConfigPath, $yaml, [Text.UTF8Encoding]::new($false))
    $fingerprint = (Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256).Hash
} finally {
    $token = $null
    $yaml = $null
    $proxyYaml = $null
    Remove-Variable token, yaml, proxyYaml -ErrorAction SilentlyContinue
}
Write-Output "配置已写入：$ConfigPath"
Write-Output "配置指纹（SHA-256）：$fingerprint"
