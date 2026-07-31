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
