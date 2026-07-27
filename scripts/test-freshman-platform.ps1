param()

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Join-Path $RepoRoot 'apps\freshman-mvp'
$DataRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$OutputRoot = Join-Path $RepoRoot 'output\freshman-platform'
$DatabasePath = Join-Path $AppRoot 'runtime\live-in-hdu.db'
$BackupDirectory = Join-Path $OutputRoot 'backups'
$PidFile = Join-Path $OutputRoot 'platform.pid.json'
$DatabaseStateScript = Join-Path $AppRoot 'scripts\database-state.mts'
$BackupScript = Join-Path $AppRoot 'scripts\backup-sqlite.mts'
$TempRoot = Join-Path $DataRoot 'temp'
$NpmCache = Join-Path $DataRoot 'npm-cache'

function Assert-RequiredJunction([string]$PathValue, [string]$Label) {
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label junction is missing: $PathValue"
    }
    $item = Get-Item -LiteralPath $PathValue -Force
    $target = [string]($item.Target | Select-Object -First 1)
    if (
        $item.LinkType -notin @('Junction', 'SymbolicLink') -or
        [IO.Path]::GetPathRoot($target).ToUpperInvariant() -ne 'D:\'
    ) {
        throw "$Label must be a junction whose target is on D:."
    }
}

Assert-RequiredJunction (Join-Path $AppRoot 'runtime') 'Runtime'
Assert-RequiredJunction (Join-Path $AppRoot 'dist') 'Dist'
Assert-RequiredJunction (Join-Path $AppRoot 'node_modules') 'node_modules'
Assert-RequiredJunction $OutputRoot 'Output'
New-Item -ItemType Directory -Path $TempRoot, $NpmCache, $BackupDirectory -Force | Out-Null
$env:TEMP = $TempRoot
$env:TMP = $TempRoot
$env:npm_config_cache = $NpmCache

function Invoke-Checked([scriptblock]$Command, [string]$Label) {
    Write-Output "== $Label =="
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Assert-NoSecrets {
    $pattern = [regex]'(?im)(?:sk-[A-Za-z0-9_-]{20,}|Bearer[ \t]+[A-Za-z0-9._-]{20,}|TOKENDANCE_API_KEY[ \t]*=[ \t]*(?!$|<)[^\r\n]{8,})'
    $texts = [Collections.Generic.List[object]]::new()
    $textExtensions = @(
        '.ts', '.mts', '.mjs', '.js', '.vue', '.json', '.md', '.ps1',
        '.html', '.css', '.txt', '.yml', '.yaml', '.example'
    )
    $tracked = & git -C $RepoRoot -c core.quotepath=false ls-files
    $intendedUntracked = & git -C $RepoRoot -c core.quotepath=false ls-files `
        --others `
        --exclude-standard `
        -- `
        'apps/freshman-mvp' `
        'scripts/start-freshman-platform.ps1' `
        'scripts/stop-freshman-platform.ps1' `
        'scripts/test-freshman-platform.ps1'
    foreach ($relativePath in @($tracked) + @($intendedUntracked)) {
        $fullPath = Join-Path $RepoRoot $relativePath
        if (
            (Test-Path -LiteralPath $fullPath -PathType Leaf) -and
            [IO.Path]::GetExtension($fullPath).ToLowerInvariant() -in $textExtensions
        ) {
            $texts.Add([pscustomobject]@{
                Path = $fullPath
                Text = Get-Content -Raw -LiteralPath $fullPath
            })
        }
    }

    $scanRoots = @(
        (Join-Path $AppRoot 'dist\client'),
        $OutputRoot
    )
    foreach ($root in $scanRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -Recurse -File |
            Where-Object { $_.Extension -in @('.js', '.css', '.html', '.json', '.log', '.txt', '.md') } |
            ForEach-Object {
                $texts.Add([pscustomobject]@{
                    Path = $_.FullName
                    Text = Get-Content -Raw -LiteralPath $_.FullName -ErrorAction Stop
                })
            }
    }
    Get-ChildItem -LiteralPath $AppRoot -Filter '*.example' -File |
        ForEach-Object {
            $texts.Add([pscustomobject]@{
                Path = $_.FullName
                Text = Get-Content -Raw -LiteralPath $_.FullName
            })
        }

    $findings = foreach ($item in $texts) {
        $candidate = if ($null -eq $item.Text) { '' } else { [string]$item.Text }
        $unsafeMatch = $pattern.Matches($candidate) | Where-Object {
            $_.Value -notmatch '(?i)test|example|placeholder|replace|dummy|fake'
        } | Select-Object -First 1
        if ($unsafeMatch) { [string]$item.Path }
    }
    if ($findings) {
        throw "Potential credential material found in: $($findings -join ', ')"
    }
}

foreach ($scriptName in @(
    'start-freshman-platform.ps1',
    'stop-freshman-platform.ps1',
    'test-freshman-platform.ps1'
)) {
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $PSScriptRoot $scriptName),
        [ref]$null,
        [ref]$errors
    ) | Out-Null
    if ($errors.Count -gt 0) {
        throw "PowerShell syntax check failed for $scriptName`: $($errors.Message -join '; ')"
    }
}

& (Join-Path $PSScriptRoot 'stop-freshman-platform.ps1') | Out-Host
Invoke-Checked { npm --prefix $AppRoot test } 'backend tests'
Invoke-Checked { npm --prefix $AppRoot run test:web } 'web tests'
Invoke-Checked { npm --prefix $RepoRoot run test:mvp } 'legacy MVP regression'
Invoke-Checked { npm --prefix $AppRoot run build } 'production build'
Assert-NoSecrets

try {
    & (Join-Path $PSScriptRoot 'start-freshman-platform.ps1') | Out-Host
    $runtimeMetadata = Get-Content -Raw -LiteralPath $PidFile | ConvertFrom-Json
    $baseUrl = "http://localhost:$([int]$runtimeMetadata.port)"
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 5
    if ($health.status -ne 'ok' -or $health.components.database.status -ne 'ok') {
        throw 'HTTP smoke health response was not healthy'
    }
    foreach ($url in @(
        "$baseUrl/",
        "$baseUrl/chat",
        "$baseUrl/admin",
        "$baseUrl/api/questions"
    )) {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -ne 200) { throw "HTTP smoke failed: $url" }
    }

    $stateJson = (& npm --prefix $AppRoot exec -- tsx $DatabaseStateScript --database $DatabasePath | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Production data count check failed' }
    $state = $stateJson | ConvertFrom-Json
    if (
        [int]$state.counts.intents -lt 35 -or
        [int]$state.counts.rawAnswers -lt 31 -or
        [int]$state.counts.q11RawAnswers -ne 0 -or
        [int]$state.counts.q11Published -ne 0 -or
        [int]$state.counts.invalidNumericRawAnswers -ne 0
    ) {
        throw "Unexpected production counts: $($state.counts | ConvertTo-Json -Compress)"
    }

    Invoke-Checked {
        npm --prefix $AppRoot exec -- tsx $BackupScript `
            --database $DatabasePath `
            --output $BackupDirectory `
            --retain 14
    } 'online SQLite backup'
} finally {
    & (Join-Path $PSScriptRoot 'stop-freshman-platform.ps1') | Out-Host
}

try {
    & (Join-Path $PSScriptRoot 'start-freshman-platform.ps1') | Out-Host
    $restartMetadata = Get-Content -Raw -LiteralPath $PidFile | ConvertFrom-Json
    $restartHealth = Invoke-RestMethod `
        -Uri "http://localhost:$([int]$restartMetadata.port)/api/health" `
        -TimeoutSec 5
    if ($restartHealth.status -ne 'ok') {
        throw 'Second lifecycle smoke did not become healthy'
    }
} finally {
    & (Join-Path $PSScriptRoot 'stop-freshman-platform.ps1') | Out-Host
}
& (Join-Path $PSScriptRoot 'stop-freshman-platform.ps1') | Out-Host

Assert-NoSecrets
Write-Output 'All freshman platform checks passed.'
