[CmdletBinding()]
param(
    [switch]$PrintCommandOnly,
    [string]$RepoRootOverride = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = if ($RepoRootOverride) {
    [IO.Path]::GetFullPath($RepoRootOverride)
} else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}
$VendorRoot = Join-Path $RepoRoot 'vendor\WeKnora'
$VendorEnvironment = Join-Path $VendorRoot '.env'
$BaseCompose = Join-Path $VendorRoot 'docker-compose.yml'
$OverrideCompose = Join-Path $RepoRoot 'deploy\local\compose.weknora.override.yml'
$GatewayStop = Join-Path $RepoRoot 'scripts\stop-freshman-platform.ps1'
$services = @('frontend', 'app', 'docreader', 'searxng', 'redis', 'postgres')
$display = "docker compose --project-directory `"$VendorRoot`" --env-file `"$VendorEnvironment`" -f `"$BaseCompose`" -f `"$OverrideCompose`" --profile searxng stop $($services -join ' ')"

if ($PrintCommandOnly) {
    Write-Output $display
    exit 0
}

if (Test-Path -LiteralPath $GatewayStop) {
    & $GatewayStop
}
if (-not (Test-Path -LiteralPath $VendorEnvironment)) {
    Write-Output 'WeKnora 本地环境文件不存在；无需停止容器。'
    exit 0
}
& docker compose `
    --project-directory $VendorRoot `
    --env-file $VendorEnvironment `
    -f $BaseCompose `
    -f $OverrideCompose `
    --profile searxng `
    stop @services
if ($LASTEXITCODE -ne 0) {
    throw 'Knowledge stack stop command failed; volumes were not changed.'
}
Write-Output '知识库服务已停止，数据卷已保留。'
