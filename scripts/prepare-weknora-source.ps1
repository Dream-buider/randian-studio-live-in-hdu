[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VendorRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourcePath = Join-Path $VendorRoot 'cmd\download\duckdb\duckdb.go'
$dockerfilePath = Join-Path $VendorRoot 'docker\Dockerfile.app'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Pinned WeKnora DuckDB downloader is missing: $sourcePath"
}
if (-not (Test-Path -LiteralPath $dockerfilePath -PathType Leaf)) {
    throw "Pinned WeKnora app Dockerfile is missing: $dockerfilePath"
}

$source = (Get-Content -Raw -LiteralPath $sourcePath -Encoding UTF8).Replace("`r`n", "`n")
$proxyMarker = 'os.LookupEnv("HTTP_PROXY")'
$sqlMarker = 'SET http_proxy = ?;'
$repositoryBlock = @'

	if _, err := sqlDB.ExecContext(ctx, "SET custom_extension_repository = 'https://extensions.duckdb.org';"); err != nil {
		panic(fmt.Errorf("failed to configure the official DuckDB extension repository: %w", err))
	}
'@
$changed = $false
if ($source.Contains($repositoryBlock)) {
    $source = $source.Replace($repositoryBlock, '')
    $changed = $true
}

$importNeedle = "`t`"fmt`"`n"
$connectionNeedle = "`tdefer sqlDB.Close()`n"
if (-not $source.Contains($importNeedle) -or -not $source.Contains($connectionNeedle)) {
    throw 'Pinned WeKnora DuckDB downloader no longer matches the reviewed 0.7.0 source; refusing an unsafe automatic patch.'
}

if (-not $source.Contains($proxyMarker)) {
    $source = $source.Replace(
        $importNeedle,
        "$importNeedle`t`"os`"`n"
    )
    $changed = $true
}

$insertion = ''
if (-not $source.Contains($proxyMarker) -or -not $source.Contains($sqlMarker)) {
    $insertion += @'

	if proxyURL, ok := os.LookupEnv("HTTP_PROXY"); ok && proxyURL != "" {
		if _, err := sqlDB.ExecContext(ctx, "SET http_proxy = ?;", proxyURL); err != nil {
			panic(fmt.Errorf("failed to configure DuckDB HTTP proxy: %w", err))
		}
	}
'@
    $changed = $true
}
$source = $source.Replace($connectionNeedle, "$connectionNeedle$insertion`n")

$dockerfile = (Get-Content -Raw -LiteralPath $dockerfilePath -Encoding UTF8).Replace("`r`n", "`n")
$aptOptions = '-o Acquire::Retries=10 -o Acquire::http::Pipeline-Depth=0 -o Acquire::Queue-Mode=access'
if (-not $dockerfile.Contains('Acquire::Retries=10')) {
    $dockerfile = $dockerfile.Replace('apt-get update', "apt-get $aptOptions update")
    $dockerfile = $dockerfile.Replace('apt-get install', "apt-get $aptOptions install")
    $changed = $true
}
$uvInstallNeedle = @'
    mkdir -p /home/appuser/.local/bin && \
    curl -LsSf https://astral.sh/uv/install.sh | CARGO_HOME=/home/appuser/.cargo UV_INSTALL_DIR=/home/appuser/.local/bin sh && \
    chown -R appuser:appuser /home/appuser && \
    ln -sf /home/appuser/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uvx && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
'@
$uvInstallReplacement = @'
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/appuser/.local/bin && \
    uv_installed=false; \
    for attempt in 1 2 3 4 5; do \
        if curl -LsSf --retry 3 --retry-all-errors --connect-timeout 20 \
            https://astral.sh/uv/install.sh -o /tmp/uv-install.sh && \
            CARGO_HOME=/home/appuser/.cargo UV_INSTALL_DIR=/home/appuser/.local/bin sh /tmp/uv-install.sh; then \
            uv_installed=true; \
            break; \
        fi; \
        sleep 5; \
    done && \
    test "$uv_installed" = true && \
    rm -f /tmp/uv-install.sh && \
    chown -R appuser:appuser /home/appuser && \
    ln -sf /home/appuser/.local/bin/uvx /usr/local/bin/uvx && \
    chmod +x /usr/local/bin/uvx
'@
if ($dockerfile.Contains($uvInstallNeedle)) {
    $dockerfile = $dockerfile.Replace($uvInstallNeedle, $uvInstallReplacement)
    $changed = $true
}

if (-not $changed) {
    Write-Output 'already-patched'
    exit 0
}
[IO.File]::WriteAllText($sourcePath, $source, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($dockerfilePath, $dockerfile, [Text.UTF8Encoding]::new($false))
Write-Output 'patched'
