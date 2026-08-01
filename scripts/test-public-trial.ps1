[CmdletBinding()]
param(
    [switch]$StaticOnly,
    [switch]$UseSavedPublicUrl,
    [string]$BaseUrl = 'http://127.0.0.1:3211',
    [string]$CookieHeader = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$RuntimeRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$EnvFile = Join-Path $AppRoot '.env.local'
$PublicUrlFile = Join-Path $RuntimeRoot 'public-trial\public-trial-url.txt'
$CpolarConfig = Join-Path $RuntimeRoot 'public-trial\cpolar\cpolar.yml'

if ($StaticOnly) {
    [ordered]@{
        mode = 'static'
        runtimeRoot = $RuntimeRoot
        defaultBaseUrl = 'http://127.0.0.1:3211'
        processStarted = $false
        firewallMutation = $false
    } | ConvertTo-Json -Compress
    exit 0
}

if ($UseSavedPublicUrl) {
    if (-not (Test-Path -LiteralPath $PublicUrlFile -PathType Leaf)) {
        throw "尚未生成公网地址文件：$PublicUrlFile"
    }
    $BaseUrl = (Get-Content -Raw -LiteralPath $PublicUrlFile -Encoding UTF8).Trim()
    if (-not $BaseUrl.StartsWith('https://')) {
        throw '保存的公网地址不是 HTTPS，拒绝测试。'
    }
}

function Get-EnvironmentValue([string]$PathValue, [string]$Name) {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) { return '' }
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        if ($parts[0].Trim() -ne $Name) { continue }
        $value = $parts[1].Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        return $value
    }
    return ''
}

function Get-CpolarHttpProxy([string]$PathValue) {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) { return $null }
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        if ($line -notmatch '^\s*http_proxy\s*:\s*(\S+)\s*$') { continue }
        try {
            $uri = [Uri]$Matches[1]
        } catch {
            throw 'cpolar 配置中的 HTTP 代理地址无效。'
        }
        if ($uri.Scheme -ne 'http' -or -not $uri.IsLoopback) {
            throw '公网验收仅允许使用 cpolar 配置中的本机 HTTP 代理。'
        }
        return $uri
    }
    return $null
}

function Invoke-StatusRequest(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [string]$Body = ''
) {
    $httpMethod = [Net.Http.HttpMethod]::new($Method)
    $request = [Net.Http.HttpRequestMessage]::new(
        $httpMethod,
        "$($BaseUrl.TrimEnd('/'))$Path"
    )
    foreach ($entry in $Headers.GetEnumerator()) {
        $request.Headers.TryAddWithoutValidation(
            [string]$entry.Key,
            [string]$entry.Value
        ) | Out-Null
    }
    if ($Body) {
        $request.Content = [Net.Http.StringContent]::new(
            $Body,
            [Text.Encoding]::UTF8,
            'application/json'
        )
    }
    try {
        $response = $script:HttpClient.Send($request)
        try {
            $setCookie = ''
            $cookieValues = [Collections.Generic.IEnumerable[string]]$null
            if ($response.Headers.TryGetValues('Set-Cookie', [ref]$cookieValues)) {
                $setCookie = [string]($cookieValues | Select-Object -First 1)
            }
            return [pscustomobject]@{
                StatusCode = [int]$response.StatusCode
                SetCookie = $setCookie
                Body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            }
        } finally {
            $response.Dispose()
        }
    } finally {
        $request.Dispose()
    }
}

$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
if ($UseSavedPublicUrl) {
    $proxyUri = Get-CpolarHttpProxy $CpolarConfig
    if ($proxyUri) {
        $handler.UseProxy = $true
        $handler.Proxy = [Net.WebProxy]::new($proxyUri)
    }
}
$script:HttpClient = [Net.Http.HttpClient]::new($handler)
$script:HttpClient.Timeout = [TimeSpan]::FromSeconds(15)

$unauthenticated = Invoke-StatusRequest -Method GET -Path '/'
if ([int]$unauthenticated.StatusCode -ne 302) {
    throw '未登录访问首页时没有返回 302。'
}

$cookie = $CookieHeader
if ([string]::IsNullOrWhiteSpace($cookie)) {
    $code = [string]$env:PUBLIC_TRIAL_ACCESS_CODE
    if ([string]::IsNullOrWhiteSpace($code)) {
        $code = Get-EnvironmentValue $EnvFile 'PUBLIC_TRIAL_ACCESS_CODE'
    }
    if ([string]::IsNullOrWhiteSpace($code)) {
        throw '没有 CookieHeader，也无法从本机配置读取测试码。'
    }
    $loginBody = @{ code = $code } | ConvertTo-Json -Compress
    $login = Invoke-StatusRequest -Method POST -Path '/trial/login' -Body $loginBody
    if ([int]$login.StatusCode -ne 200) { throw '团队测试码登录失败。' }
    $cookie = ([string]$login.SetCookie).Split(';', 2)[0]
}
$headers = @{ Cookie = $cookie }
$jsonHeaders = @{ Cookie = $cookie; Accept = 'application/json' }
$root = Invoke-StatusRequest -Method GET -Path '/' -Headers $headers
$guide = Invoke-StatusRequest -Method GET -Path '/guide' -Headers $headers
$chat = Invoke-StatusRequest -Method GET -Path '/chat' -Headers $headers
$questions = Invoke-StatusRequest -Method GET -Path '/api/questions' -Headers $jsonHeaders
$ask = Invoke-StatusRequest `
    -Method POST `
    -Path '/api/ask' `
    -Headers $headers `
    -Body (@{ question = '学校怎么办校园卡' } | ConvertTo-Json -Compress)

$blocked = [ordered]@{}
foreach ($path in @('/admin', '/api/admin/intents', '/api/reviews', '/api/health')) {
    $response = Invoke-StatusRequest -Method GET -Path $path -Headers $headers
    $blocked[$path] = [int]$response.StatusCode
    if ([int]$response.StatusCode -ne 404) {
        throw "受限路径没有返回 404：$path"
    }
}
foreach ($result in @($root, $guide, $chat, $questions, $ask)) {
    if ([int]$result.StatusCode -ne 200) {
        throw '一个允许的公网内测请求没有返回 200。'
    }
}

[ordered]@{
    baseUrl = $BaseUrl
    unauthenticatedRoot = [int]$unauthenticated.StatusCode
    authenticatedRoot = [int]$root.StatusCode
    guide = [int]$guide.StatusCode
    chat = [int]$chat.StatusCode
    questions = [int]$questions.StatusCode
    ask = [int]$ask.StatusCode
    blocked = $blocked
} | ConvertTo-Json -Depth 4 -Compress
$script:HttpClient.Dispose()
$handler.Dispose()
