param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFile,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$Value,

    [switch]$FromClipboard
)

$ErrorActionPreference = 'Stop'

if ($Name -notmatch '^[A-Z][A-Z0-9_]*$') {
    throw 'Name must be an uppercase environment variable name.'
}

$hasValue = $PSBoundParameters.ContainsKey('Value')
if ($hasValue -eq $FromClipboard.IsPresent) {
    throw 'Provide exactly one of -Value or -FromClipboard.'
}

$resolvedValue = if ($FromClipboard) {
    (Get-Clipboard -Raw).Trim()
} else {
    $Value
}
if ([string]::IsNullOrWhiteSpace($resolvedValue)) {
    throw 'The environment value must not be empty.'
}
if ($resolvedValue.Contains("`r") -or $resolvedValue.Contains("`n")) {
    throw 'The environment value must be a single line.'
}

$path = [IO.Path]::GetFullPath($EnvFile)
$directory = Split-Path -Parent $path
New-Item -ItemType Directory -Path $directory -Force | Out-Null

$content = if (Test-Path -LiteralPath $path) {
    [IO.File]::ReadAllText($path, [Text.UTF8Encoding]::new($false))
} else {
    ''
}
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$hadTrailingNewline = $content.EndsWith("`n")
$sourceLines = if ($content.Length -gt 0) {
    @($content -split '\r?\n')
} else {
    @()
}
if ($hadTrailingNewline -and $sourceLines.Count -gt 0 -and $sourceLines[-1] -eq '') {
    $sourceLines = @($sourceLines[0..($sourceLines.Count - 2)])
}

$updatedLines = [Collections.Generic.List[string]]::new()
$replaced = $false
$pattern = '^' + [regex]::Escape($Name) + '='
foreach ($line in $sourceLines) {
    if ($line -match $pattern) {
        if (-not $replaced) {
            $updatedLines.Add("$Name=$resolvedValue")
            $replaced = $true
        }
        continue
    }
    $updatedLines.Add($line)
}
if (-not $replaced) {
    $updatedLines.Add("$Name=$resolvedValue")
}

$updated = $updatedLines -join $newline
if ($hadTrailingNewline -or $content.Length -eq 0) {
    $updated += $newline
}

$tempPath = "$path.$PID.tmp"
try {
    [IO.File]::WriteAllText($tempPath, $updated, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $tempPath -Destination $path -Force
} finally {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}

Write-Output "Updated $Name in $path without displaying its value."
