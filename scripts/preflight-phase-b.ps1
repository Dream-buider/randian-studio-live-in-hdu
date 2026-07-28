[CmdletBinding()]
param(
    [string]$JsonOutput = '',
    [string]$FixtureJson = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$RequestedRoot = 'D:\'
$ActualRoot = 'D:\Star\LIVE_IN_HDU_RUNTIME'
$FallbackReason = 'Requested D:\ root is not writable for the normal user under the current ACL; using the existing D:\Star\LIVE_IN_HDU_RUNTIME root.'
$RequiredPorts = @(3210, 5433, 8080, 8888, 11434)
$EmbeddingModel = 'nomic-embed-text:latest'
$MinimumFreeDiskGb = 50
$MinimumMemoryGb = 16

function Invoke-NativeText([scriptblock]$Command) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $text = ((& $Command 2>$null | Out-String) -replace "`0", '').Trim()
        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Text = $text
        }
    } catch {
        return [pscustomobject]@{
            ExitCode = 1
            Text = ''
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Test-WslVersion2 {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        return $false
    }
    $distributions = Invoke-NativeText { wsl.exe --list --verbose }
    if ($distributions.ExitCode -eq 0 -and $distributions.Text -match '(?m)\s2\s*$') {
        return $true
    }
    $status = Invoke-NativeText { wsl.exe --status }
    return $status.ExitCode -eq 0 -and
        $status.Text -match '(?im)(default\s+version|默认版本)\D*2'
}

function Get-VirtualizationStatus {
    try {
        $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        $processors = @(Get-CimInstance Win32_Processor -ErrorAction Stop)
        return [bool]$computer.HypervisorPresent -or
            @($processors | Where-Object { $_.VirtualizationFirmwareEnabled }).Count -gt 0
    } catch {
        return $false
    }
}

function Get-TotalMemoryGb {
    try {
        $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        return [Math]::Round(([double]$computer.TotalPhysicalMemory / 1GB), 2)
    } catch {
        return 0
    }
}

function Get-FreeDiskGb {
    try {
        $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'" -ErrorAction Stop
        return [Math]::Round(([double]$drive.FreeSpace / 1GB), 2)
    } catch {
        return 0
    }
}

function Get-AvailablePorts {
    $listeners = @(
        [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().
            GetActiveTcpListeners() |
            ForEach-Object { $_.Port }
    )
    return @($RequiredPorts | Where-Object { $_ -notin $listeners })
}

function Get-LiveProbe {
    $dockerCli = [bool](Get-Command docker -ErrorAction SilentlyContinue)
    $dockerEngine = $false
    $composeV2 = $false
    if ($dockerCli) {
        $engine = Invoke-NativeText { docker version --format '{{.Server.Version}}' }
        $dockerEngine = $engine.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($engine.Text)
        $compose = Invoke-NativeText { docker compose version --short }
        $composeV2 = $compose.ExitCode -eq 0 -and $compose.Text -match '^v?2(?:\.|$)'
    }

    $node24 = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nodeVersion = Invoke-NativeText { node --version }
        $node24 = $nodeVersion.ExitCode -eq 0 -and $nodeVersion.Text -match '^v24(?:\.|$)'
    }

    $ollamaCli = [bool](Get-Command ollama -ErrorAction SilentlyContinue)
    $embeddingModelAvailable = $false
    if ($ollamaCli) {
        $models = Invoke-NativeText { ollama list }
        $embeddingModelAvailable = $models.ExitCode -eq 0 -and
            $models.Text -match '(?im)^nomic-embed-text:latest(?:\s|$)'
    }

    return [pscustomobject]@{
        wslVersion2 = Test-WslVersion2
        dockerCli = $dockerCli
        dockerEngine = $dockerEngine
        composeV2 = $composeV2
        node24 = $node24
        virtualization = Get-VirtualizationStatus
        freeDiskGb = Get-FreeDiskGb
        memoryGb = Get-TotalMemoryGb
        ollamaCli = $ollamaCli
        embeddingModelAvailable = $embeddingModelAvailable
        portsAvailable = @(Get-AvailablePorts)
        requestedRoot = $RequestedRoot
        actualRoot = $ActualRoot
        fallbackReason = $FallbackReason
    }
}

function Get-Probe {
    if (-not $FixtureJson) {
        return Get-LiveProbe
    }
    if ($env:LIVE_IN_HDU_PREFLIGHT_TEST_MODE -ne '1') {
        throw 'FixtureJson is available only when LIVE_IN_HDU_PREFLIGHT_TEST_MODE=1.'
    }
    try {
        return Get-Content -Raw -LiteralPath $FixtureJson -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Could not read preflight fixture: $FixtureJson"
    }
}

function Add-Failure(
    [Collections.Generic.List[object]]$Failures,
    [string]$Code,
    [string]$Message,
    [string]$Remediation
) {
    $Failures.Add([pscustomobject]@{
        code = $Code
        message = $Message
        remediation = $Remediation
    })
}

if (-not (Test-Path -LiteralPath $ActualRoot)) {
    New-Item -ItemType Directory -Path $ActualRoot -Force | Out-Null
}

$probe = Get-Probe
$failures = [Collections.Generic.List[object]]::new()
if (-not [bool]$probe.wslVersion2) {
    Add-Failure $failures 'wsl2-unavailable' 'No usable WSL2 distribution/default was detected.' 'Enable WSL2 and verify `wsl --list --verbose` reports version 2.'
}
if (-not [bool]$probe.dockerCli) {
    Add-Failure $failures 'docker-cli-missing' 'The Docker CLI is not installed or is not on PATH.' 'Install Docker Desktop from the official Windows installer; this preflight does not install it.'
} elseif (-not [bool]$probe.dockerEngine) {
    Add-Failure $failures 'docker-engine-stopped' 'Docker CLI exists, but the Docker engine did not answer.' 'Start Docker Desktop and wait for the WSL2 engine to become ready.'
}
if ([bool]$probe.dockerCli -and -not [bool]$probe.composeV2) {
    Add-Failure $failures 'compose-v2-unavailable' 'Docker Compose v2 was not detected.' 'Repair or update Docker Desktop, then verify `docker compose version`.'
}
if (-not [bool]$probe.node24) {
    Add-Failure $failures 'node24-unavailable' 'Node.js major version 24 was not detected.' 'Use the project Node.js 24 runtime.'
}
if (-not [bool]$probe.virtualization) {
    Add-Failure $failures 'virtualization-disabled' 'Hardware virtualization or a Windows hypervisor was not detected.' 'Enable CPU virtualization in firmware and the Windows virtualization features required by WSL2.'
}
if ([double]$probe.freeDiskGb -lt $MinimumFreeDiskGb) {
    Add-Failure $failures 'disk-space-low' "D: has only $($probe.freeDiskGb) GiB free." "Free at least $MinimumFreeDiskGb GiB on D: before pulling images or models."
}
if ([double]$probe.memoryGb -lt $MinimumMemoryGb) {
    Add-Failure $failures 'memory-low' "The machine has only $($probe.memoryGb) GiB RAM." "Phase B requires at least $MinimumMemoryGb GiB RAM."
}
if (-not [bool]$probe.ollamaCli) {
    Add-Failure $failures 'ollama-cli-missing' 'The Ollama CLI is not installed or is not on PATH.' 'Install the official Windows Ollama package later; this preflight does not install it.'
} elseif (-not [bool]$probe.embeddingModelAvailable) {
    Add-Failure $failures 'embedding-model-missing' "Ollama does not list $EmbeddingModel." "After approval, pull only `$EmbeddingModel`; do not pull a chat model."
}
$availablePorts = @($probe.portsAvailable | ForEach-Object { [int]$_ })
$unavailablePorts = @($RequiredPorts | Where-Object { $_ -notin $availablePorts })
$unexpectedPortConflicts = @($unavailablePorts | Where-Object {
    $_ -ne 11434 -or -not [bool]$probe.embeddingModelAvailable
})
if ($unexpectedPortConflicts.Count -gt 0) {
    Add-Failure $failures 'ports-in-use' "Required ports are unavailable: $($unexpectedPortConflicts -join ', ')." 'Stop or reconfigure the owning services before Phase B startup.'
}

$report = [ordered]@{
    schemaVersion = 1
    checkedAt = [DateTime]::UtcNow.ToString('o')
    ready = $failures.Count -eq 0
    requestedRoot = [string]$probe.requestedRoot
    actualRoot = [string]$probe.actualRoot
    fallbackReason = [string]$probe.fallbackReason
    wslVersion2 = [bool]$probe.wslVersion2
    dockerCli = [bool]$probe.dockerCli
    dockerEngine = [bool]$probe.dockerEngine
    composeV2 = [bool]$probe.composeV2
    node24 = [bool]$probe.node24
    virtualization = [bool]$probe.virtualization
    freeDiskGb = [double]$probe.freeDiskGb
    minimumFreeDiskGb = $MinimumFreeDiskGb
    memoryGb = [double]$probe.memoryGb
    minimumMemoryGb = $MinimumMemoryGb
    ollamaCli = [bool]$probe.ollamaCli
    embeddingModel = $EmbeddingModel
    embeddingModelAvailable = [bool]$probe.embeddingModelAvailable
    requiredPorts = $RequiredPorts
    portsAvailable = $availablePorts
    portsUnavailable = $unavailablePorts
    expectedServicePortsInUse = @($unavailablePorts | Where-Object {
        $_ -eq 11434 -and [bool]$probe.embeddingModelAvailable
    })
    failures = @($failures)
}

if (-not $JsonOutput) {
    $JsonOutput = Join-Path $ActualRoot 'reports\phase-b-preflight.json'
}
$resolvedOutput = [IO.Path]::GetFullPath($JsonOutput)
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutput) -Force | Out-Null
$json = $report | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($resolvedOutput, $json, [Text.UTF8Encoding]::new($false))

if ($report.ready) {
    Write-Host "Phase B preflight passed. Report: $resolvedOutput"
} else {
    Write-Host "Phase B preflight is not ready. Report: $resolvedOutput"
    foreach ($failure in $failures) {
        Write-Host "[$($failure.code)] $($failure.message) $($failure.remediation)"
    }
}
Write-Output $json
if (-not $report.ready) {
    exit 1
}
