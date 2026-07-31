[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [switch]$StaticOnly,
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
$VersionFile = Join-Path $VendorRoot 'VERSION'
$LicenseFile = Join-Path $VendorRoot 'LICENSE'
$BaseCompose = Join-Path $VendorRoot 'docker-compose.yml'
$BaselineDocument = Join-Path $RepoRoot 'docs\WEKNORA_UPSTREAM_BASELINE.md'
$OverrideCompose = Join-Path $RepoRoot 'deploy\local\compose.weknora.override.yml'
$PlatformCompose = Join-Path $RepoRoot 'deploy\local\compose.platform.yml'
$PlatformEnvironment = Join-Path $RepoRoot 'deploy\local\.env.local'
$VendorEnvironment = Join-Path $VendorRoot '.env'
$PreflightScript = Join-Path $RepoRoot 'scripts\preflight-phase-b.ps1'
$GatewayStartScript = Join-Path $RepoRoot 'scripts\start-freshman-platform.ps1'
$PinnedVersion = '0.7.0'
$PinnedCommit = '150c07368b84b4f50421b8957255213cbbadc175'
$RuntimeRoot = if ($env:LIVE_IN_HDU_RUNTIME_ROOT) {
    [IO.Path]::GetFullPath($env:LIVE_IN_HDU_RUNTIME_ROOT)
} else {
    'D:\Star\LIVE_IN_HDU_RUNTIME'
}

function Assert-PinnedVendor {
    foreach ($required in @(
        $VersionFile,
        $LicenseFile,
        $BaseCompose,
        $BaselineDocument,
        $OverrideCompose
    )) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required pinned WeKnora file is missing: $required"
        }
    }
    $version = (Get-Content -Raw -LiteralPath $VersionFile -Encoding UTF8).Trim()
    if ($version -ne $PinnedVersion) {
        throw "WeKnora vendor version must be pinned to $PinnedVersion; found '$version'."
    }
    $baseline = Get-Content -Raw -LiteralPath $BaselineDocument -Encoding UTF8
    if (-not $baseline.Contains($PinnedCommit)) {
        throw "WeKnora baseline document does not contain pinned commit $PinnedCommit."
    }
    $override = Get-Content -Raw -LiteralPath $OverrideCompose -Encoding UTF8
    $loopbackOverride = (
        $override -match '(?m)^\s+ports:\s*!override\s*$' -and
        $override -match '127\.0\.0\.1:\$\{APP_PORT:-8080\}:8080' -and
        $override -match '127\.0\.0\.1:\$\{FRONTEND_PORT:-8081\}:80'
    )
    if (-not $loopbackOverride) {
        throw 'WeKnora app and frontend must use !override loopback-only port bindings.'
    }
    return [ordered]@{
        vendorVersion = $version
        pinnedCommit = $PinnedCommit
        licensePresent = $true
        loopbackOverride = $true
        dockerInvoked = $false
    }
}

function New-RandomHex([int]$ByteCount = 32) {
    return [Convert]::ToHexString(
        [Security.Cryptography.RandomNumberGenerator]::GetBytes($ByteCount)
    ).ToLowerInvariant()
}

function Import-LocalEnvironment([string]$PathValue) {
    if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
        throw "Required untracked local environment file is missing: $PathValue"
    }
    foreach ($line in Get-Content -LiteralPath $PathValue -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Write-MinimalVendorEnvironment {
    if (Test-Path -LiteralPath $VendorEnvironment) {
        $existing = Get-Content -Raw -LiteralPath $VendorEnvironment -Encoding UTF8
        if ($existing -match '(?m)^WEKNORA_VERSION=latest\s*$') {
            throw 'Existing WeKnora environment requests latest; use the pinned 0.7.0 release.'
        }
        return
    }
    $lines = @(
        'WEKNORA_VERSION=0.7.0'
        'APP_PORT=8080'
        'FRONTEND_PORT=8081'
        'DB_USER=weknora'
        'DB_NAME=weknora'
        'DB_DRIVER=postgres'
        'DB_HOST=postgres'
        'DB_PORT=5432'
        "DB_PASSWORD=$(New-RandomHex)"
        'REDIS_ADDR=redis:6379'
        "REDIS_PASSWORD=$(New-RandomHex)"
        'REDIS_DB=0'
        'REDIS_PREFIX=stream:'
        "JWT_SECRET=$(New-RandomHex)"
        'OLLAMA_BASE_URL=http://host.docker.internal:11434'
        'DISABLE_REGISTRATION=false'
        'SEARXNG_BIND=127.0.0.1'
        'SEARXNG_PORT=8888'
        "SEARXNG_SECRET=$(New-RandomHex)"
        'LANGFUSE_ENABLED=false'
        'LANGFUSE_PUBLIC_KEY='
        'LANGFUSE_SECRET_KEY='
    )
    [IO.File]::WriteAllLines(
        $VendorEnvironment,
        $lines,
        [Text.UTF8Encoding]::new($false)
    )
}

function Get-PropertyValuesRecursive($Value, [string[]]$Names) {
    if ($null -eq $Value) { return }
    if ($Value -is [Collections.IDictionary]) {
        foreach ($key in $Value.Keys) {
            if ($Names -contains [string]$key) {
                [string]$Value[$key]
            }
            Get-PropertyValuesRecursive $Value[$key] $Names
        }
        return
    }
    if ($Value -is [Collections.IEnumerable] -and $Value -isnot [string]) {
        foreach ($item in $Value) {
            Get-PropertyValuesRecursive $item $Names
        }
        return
    }
    foreach ($property in $Value.PSObject.Properties) {
        if ($Names -contains $property.Name) {
            [string]$property.Value
        }
        Get-PropertyValuesRecursive $property.Value $Names
    }
}

function Assert-DockerDiskImageOnD {
    $settingsFiles = @(
        (Join-Path $env:APPDATA 'Docker\settings-store.json'),
        (Join-Path $env:APPDATA 'Docker\settings.json'),
        (Join-Path $env:USERPROFILE '.docker\desktop-settings.json')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
    $candidates = foreach ($settingsFile in $settingsFiles) {
        try {
            $settings = Get-Content -Raw -LiteralPath $settingsFile -Encoding UTF8 |
                ConvertFrom-Json
            Get-PropertyValuesRecursive $settings @(
                'dataFolder',
                'diskImageLocation',
                'wslDiskLocation',
                'dataRoot'
            )
        } catch {
            throw "Could not read Docker Desktop settings: $settingsFile"
        }
    }
    $expected = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot 'docker')).TrimEnd('\')
    $confirmed = @($candidates) | Where-Object {
        $_ -and
        [IO.Path]::IsPathRooted($_) -and
        [IO.Path]::GetFullPath($_).TrimEnd('\').StartsWith(
            $expected,
            [StringComparison]::OrdinalIgnoreCase
        )
    } | Select-Object -First 1
    if (-not $confirmed -or -not (Test-Path -LiteralPath $confirmed)) {
        throw "Docker disk image location is not verified under $expected. Configure Docker Desktop, restart it, and rerun."
    }
}

$validation = Assert-PinnedVendor
if ($ValidateOnly) {
    $validation | ConvertTo-Json -Compress
    exit 0
}
if ($StaticOnly) {
    [ordered]@{
        dockerInvoked = $false
        runtimeRoot = $RuntimeRoot
        startOrder = @('business-postgres', 'weknora-and-searxng', 'gateway')
        volumesDeleted = $false
    } | ConvertTo-Json -Compress
    exit 0
}

if ([IO.Path]::GetPathRoot($RuntimeRoot).ToUpperInvariant() -ne 'D:\') {
    throw "LIVE_IN_HDU_RUNTIME_ROOT must be on D:, found $RuntimeRoot"
}
New-Item -ItemType Directory -Force -Path @(
    $RuntimeRoot,
    (Join-Path $RuntimeRoot 'docker'),
    (Join-Path $RuntimeRoot 'ollama\models'),
    (Join-Path $RuntimeRoot 'logs'),
    (Join-Path $RuntimeRoot 'backups'),
    (Join-Path $RuntimeRoot 'temp')
) | Out-Null
$env:TEMP = Join-Path $RuntimeRoot 'temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $RuntimeRoot 'npm-cache'
$env:OLLAMA_MODELS = Join-Path $RuntimeRoot 'ollama\models'

if (-not (Test-Path -LiteralPath $PreflightScript)) {
    throw "Phase B preflight script is missing: $PreflightScript"
}
$preflightReport = Join-Path $RuntimeRoot 'knowledge\phase-b-preflight.json'
& $PreflightScript -JsonOutput $preflightReport
if ($LASTEXITCODE -ne 0) {
    throw "Phase B preflight failed; inspect $preflightReport"
}
Assert-DockerDiskImageOnD
try {
    $composeVersionText = (& docker compose version --short 2>$null | Out-String).Trim().TrimStart('v')
    $composeVersion = [Version]$composeVersionText
} catch {
    throw 'Could not determine Docker Compose version.'
}
if ($composeVersion -lt [Version]'2.24.4') {
    throw "Docker Compose 2.24.4 or newer is required for !override; found $composeVersionText."
}
& ollama show 'nomic-embed-text:latest' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Ollama embedding model is not verified under $env:OLLAMA_MODELS"
}
$ollamaManifest = Join-Path $env:OLLAMA_MODELS 'manifests\registry.ollama.ai\library\nomic-embed-text\latest'
if (-not (Test-Path -LiteralPath $ollamaManifest -PathType Leaf)) {
    throw "Ollama reports the model, but its manifest is not under the required D-drive location: $ollamaManifest"
}

Import-LocalEnvironment $PlatformEnvironment
foreach ($requiredName in @('LIVE_IN_HDU_DB_PASSWORD')) {
    if (-not [Environment]::GetEnvironmentVariable($requiredName, 'Process')) {
        throw "$requiredName must be set in $PlatformEnvironment"
    }
}
$postgresData = if ($env:POSTGRES_DATA_DIR) {
    [IO.Path]::GetFullPath($env:POSTGRES_DATA_DIR)
} else {
    Join-Path $RuntimeRoot 'postgres'
}
if ([IO.Path]::GetPathRoot($postgresData).ToUpperInvariant() -ne 'D:\') {
    throw "POSTGRES_DATA_DIR must be on D:, found $postgresData"
}
New-Item -ItemType Directory -Force -Path $postgresData | Out-Null

Write-MinimalVendorEnvironment
$businessComposeArgs = @(
    'compose',
    '--project-name', 'live-in-hdu',
    '--env-file', $PlatformEnvironment,
    '-f', $PlatformCompose
)
$composeArgs = @(
    'compose',
    '--project-directory', $VendorRoot,
    '--env-file', $VendorEnvironment,
    '-f', $BaseCompose,
    '-f', $OverrideCompose,
    '--profile', 'searxng'
)
& docker @businessComposeArgs config | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Business PostgreSQL compose validation failed.' }
& docker @composeArgs config | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'docker compose config validation failed.' }
& docker @businessComposeArgs up -d live-in-hdu-db
if ($LASTEXITCODE -ne 0) { throw 'LIVE IN HDU PostgreSQL failed to start.' }
$databaseName = if ($env:LIVE_IN_HDU_DB_NAME) { $env:LIVE_IN_HDU_DB_NAME } else { 'live_in_hdu' }
$databaseUser = if ($env:LIVE_IN_HDU_DB_USER) { $env:LIVE_IN_HDU_DB_USER } else { 'live_in_hdu' }
$postgresDeadline = [DateTime]::UtcNow.AddMinutes(2)
$postgresReady = $false
while ([DateTime]::UtcNow -lt $postgresDeadline) {
    & docker @businessComposeArgs exec -T live-in-hdu-db pg_isready -U $databaseUser -d $databaseName *> $null
    if ($LASTEXITCODE -eq 0) {
        $postgresReady = $true
        break
    }
    Start-Sleep -Milliseconds 500
}
if (-not $postgresReady) { throw 'LIVE IN HDU PostgreSQL did not become ready within two minutes.' }
& docker @composeArgs up -d postgres redis
if ($LASTEXITCODE -ne 0) { throw 'WeKnora PostgreSQL and Redis failed to start.' }
& docker @composeArgs up -d docreader app frontend searxng-init searxng
if ($LASTEXITCODE -ne 0) { throw 'WeKnora minimum stack failed to start.' }

$deadline = [DateTime]::UtcNow.AddMinutes(5)
$ready = $false
while ([DateTime]::UtcNow -lt $deadline) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 3
        $search = Invoke-RestMethod -Uri 'http://127.0.0.1:8888/search?q=health&format=json' -TimeoutSec 3
        if ($null -ne $health -and $null -ne $search.results) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $ready) {
    throw 'WeKnora or SearXNG did not become healthy within five minutes.'
}

if (Test-Path -LiteralPath $GatewayStartScript) {
    $databasePort = if ($env:LIVE_IN_HDU_DB_PORT) { $env:LIVE_IN_HDU_DB_PORT } else { '5433' }
    $escapedPassword = [Uri]::EscapeDataString($env:LIVE_IN_HDU_DB_PASSWORD)
    $env:DATABASE_PROVIDER = 'postgres'
    $env:POSTGRES_URL = "postgresql://${databaseUser}:${escapedPassword}@127.0.0.1:${databasePort}/${databaseName}"
    $env:KNOWLEDGE_PROVIDER = 'weknora'
    $env:SEARCH_PROVIDER = 'searxng'
    & $GatewayStartScript
    if ($LASTEXITCODE -ne 0) { throw 'LIVE IN HDU gateway failed to start.' }
}
Write-Output 'WeKnora API：http://127.0.0.1:8080'
Write-Output 'WeKnora 管理界面：http://127.0.0.1:8081'
Write-Output 'SearXNG（仅本机）：http://127.0.0.1:8888'
