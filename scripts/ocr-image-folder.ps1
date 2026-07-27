param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDir,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Get-OcrText([string]$Path, $Engine) {
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await-WinRt ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return $result.Text
  } finally {
    $stream.Dispose()
  }
}

$resolvedSource = (Resolve-Path -LiteralPath $SourceDir).Path
$language = [Windows.Globalization.Language]::new('zh-Hans-CN')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if (-not $engine) {
  throw 'Windows Chinese OCR engine is unavailable.'
}

$images = Get-ChildItem -LiteralPath $resolvedSource -Recurse -File -Filter '*.png' | Sort-Object DirectoryName, Name
$entries = [System.Collections.Generic.List[object]]::new()
$index = 0
foreach ($image in $images) {
  $index++
  $entries.Add([PSCustomObject]@{
    index = $index
    group = Split-Path $image.DirectoryName -Leaf
    file = $image.Name
    path = $image.FullName
    text = Get-OcrText $image.FullName $engine
  })
  Write-Progress -Activity 'OCR latest materials' -Status "$index / $($images.Count)" -PercentComplete (($index / $images.Count) * 100)
}

$result = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  sourceDir = $resolvedSource
  imageCount = $entries.Count
  entries = $entries
}

$parent = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "Wrote $($entries.Count) OCR entries: $OutputPath"
