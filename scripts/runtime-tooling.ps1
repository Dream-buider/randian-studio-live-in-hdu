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
        return [pscustomobject]@{
            Path = $overridePath
            Source = 'explicit-override'
        }
    }

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) {
        return [pscustomobject]@{
            Path = [IO.Path]::GetFullPath($command.Source)
            Source = 'path'
        }
    }

    $runtimeCandidate = [IO.Path]::GetFullPath(
        (Join-Path $RuntimeRoot $RuntimeRelativePath)
    )
    if (Test-Path -LiteralPath $runtimeCandidate -PathType Leaf) {
        return [pscustomobject]@{
            Path = $runtimeCandidate
            Source = 'runtime-fallback'
        }
    }

    throw "$Name CLI was not found on PATH or at the expected runtime path: $runtimeCandidate"
}
