function Enable-LiveInHduToolDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ToolPath
    )

    $toolDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ToolPath))
    $pathEntries = @(
        ([string]$env:PATH).Split(
            [IO.Path]::PathSeparator,
            [StringSplitOptions]::RemoveEmptyEntries
        ) | ForEach-Object { $_.Trim().TrimEnd('\') }
    )
    if ($pathEntries -inotcontains $toolDirectory.TrimEnd('\')) {
        $updatedPath = if ([string]::IsNullOrWhiteSpace($env:PATH)) {
            $toolDirectory
        } else {
            "$toolDirectory$([IO.Path]::PathSeparator)$env:PATH"
        }
        [Environment]::SetEnvironmentVariable('PATH', $updatedPath, 'Process')
    }
    return $toolDirectory
}

function Resolve-LiveInHduTool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$RuntimeRoot,

        [Parameter(Mandatory)]
        [string]$RuntimeRelativePath
    )

    $overrideName = "LIVE_IN_HDU_$($Name.ToUpperInvariant())_CLI"
    $override = [Environment]::GetEnvironmentVariable($overrideName, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($override)) {
        $overridePath = [IO.Path]::GetFullPath($override)
        if (-not (Test-Path -LiteralPath $overridePath -PathType Leaf)) {
            throw "$overrideName points to a missing file: $overridePath"
        }
        Enable-LiveInHduToolDirectory -ToolPath $overridePath | Out-Null
        return [pscustomobject]@{
            Path = $overridePath
            Source = 'explicit-override'
        }
    }

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) {
        Enable-LiveInHduToolDirectory -ToolPath $command.Source | Out-Null
        return [pscustomobject]@{
            Path = [IO.Path]::GetFullPath($command.Source)
            Source = 'path'
        }
    }

    $runtimeCandidate = [IO.Path]::GetFullPath(
        (Join-Path $RuntimeRoot $RuntimeRelativePath)
    )
    if (Test-Path -LiteralPath $runtimeCandidate -PathType Leaf) {
        Enable-LiveInHduToolDirectory -ToolPath $runtimeCandidate | Out-Null
        return [pscustomobject]@{
            Path = $runtimeCandidate
            Source = 'runtime-fallback'
        }
    }

    throw "$Name CLI was not found on PATH or at the expected runtime path: $runtimeCandidate"
}

function Get-LiveInHduPropertyValuesRecursive {
    [CmdletBinding()]
    param(
        $Value,

        [Parameter(Mandatory)]
        [string[]]$Names
    )

    if ($null -eq $Value) { return }
    if ($Value -is [Collections.IDictionary]) {
        foreach ($key in $Value.Keys) {
            if ($Names -contains [string]$key) {
                [string]$Value[$key]
            }
            Get-LiveInHduPropertyValuesRecursive -Value $Value[$key] -Names $Names
        }
        return
    }
    if ($Value -is [Collections.IEnumerable] -and $Value -isnot [string]) {
        foreach ($item in $Value) {
            Get-LiveInHduPropertyValuesRecursive -Value $item -Names $Names
        }
        return
    }
    foreach ($property in $Value.PSObject.Properties) {
        if ($Names -contains $property.Name) {
            [string]$property.Value
        }
        Get-LiveInHduPropertyValuesRecursive -Value $property.Value -Names $Names
    }
}

function Assert-LiveInHduDockerDiskImageOnD {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RuntimeRoot,

        [Parameter(Mandatory)]
        [string[]]$SettingsFiles
    )

    $candidates = foreach ($settingsFile in $SettingsFiles) {
        if (-not (Test-Path -LiteralPath $settingsFile -PathType Leaf)) { continue }
        try {
            $settings = Get-Content -Raw -LiteralPath $settingsFile -Encoding UTF8 |
                ConvertFrom-Json
            Get-LiveInHduPropertyValuesRecursive -Value $settings -Names @(
                'dataFolder',
                'diskImageLocation',
                'wslDiskLocation',
                'dataRoot',
                'CustomWslDistroDir'
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
