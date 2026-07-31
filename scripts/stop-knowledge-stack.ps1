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
$PlatformCompose = Join-Path $RepoRoot 'deploy\local\compose.platform.yml'
$PlatformEnvironment = Join-Path $RepoRoot 'deploy\local\.env.local'
$GatewayStop = Join-Path $RepoRoot 'scripts\stop-freshman-platform.ps1'
$RuntimeRoot = if ($env:LIVE_IN_HDU_RUNTIME_ROOT) {
    [IO.Path]::GetFullPath($env:LIVE_IN_HDU_RUNTIME_ROOT)
} else {
    'D:\Star\LIVE_IN_HDU_RUNTIME'
}
$RuntimeTooling = Join-Path $PSScriptRoot 'runtime-tooling.ps1'
if (-not (Test-Path -LiteralPath $RuntimeTooling -PathType Leaf)) {
    throw "Runtime tooling helper is missing: $RuntimeTooling"
}
. $RuntimeTooling
$dockerTool = Resolve-LiveInHduTool `
    -Name 'docker' `
    -RuntimeRoot $RuntimeRoot `
    -RuntimeRelativePath 'docker\DockerDesktop\resources\bin\docker.exe'
$dockerCli = [string]$dockerTool.Path
$services = @('frontend', 'app', 'docreader', 'searxng', 'redis', 'postgres')
$display = @(
    "`"$dockerCli`" compose --project-directory `"$VendorRoot`" --env-file `"$VendorEnvironment`" -f `"$BaseCompose`" -f `"$OverrideCompose`" --profile searxng stop $($services -join ' ')"
    "`"$dockerCli`" compose --project-name live-in-hdu --env-file `"$PlatformEnvironment`" -f `"$PlatformCompose`" stop live-in-hdu-db"
) -join [Environment]::NewLine

if ($PrintCommandOnly) {
    Write-Output $display
    exit 0
}

if (Test-Path -LiteralPath $GatewayStop) {
    & $GatewayStop
}
if (-not (Test-Path -LiteralPath $VendorEnvironment)) {
    Write-Output 'WeKnora 本地环境文件不存在；无需停止容器。'
} else {
    & $dockerCli compose `
        --project-directory $VendorRoot `
        --env-file $VendorEnvironment `
        -f $BaseCompose `
        -f $OverrideCompose `
        --profile searxng `
        stop @services
    if ($LASTEXITCODE -ne 0) {
        throw 'WeKnora stop command failed; volumes were not changed.'
    }
}
if (Test-Path -LiteralPath $PlatformEnvironment) {
    & $dockerCli compose `
        --project-name live-in-hdu `
        --env-file $PlatformEnvironment `
        -f $PlatformCompose `
        stop live-in-hdu-db
    if ($LASTEXITCODE -ne 0) {
        throw 'Business PostgreSQL stop command failed; its D-drive data was not changed.'
    }
}
Write-Output '知识库服务已停止，数据卷已保留。'
