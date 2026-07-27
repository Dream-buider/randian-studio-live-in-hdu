param(
  [string]$SourceDir = (Join-Path (Split-Path $PSScriptRoot -Parent) '期末复习资料\物理'),
  [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\期末复习发布_2026-05-27\physics-ocr-index.json'),
  [string[]]$AdditionalImages = @(
    (Join-Path (Split-Path $PSScriptRoot -Parent) '期末复习资料\数学\24ce5de5-70fa-4a2f-b102-4ab65f59d988.png')
  )
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
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await-WinRt ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $stream.Dispose()
  return ($result.Text -replace '\s+', '')
}

$topicKeywords = [ordered]@{
  '力学' = @('质点', '位移', '速度', '加速度', '运动', '牛顿', '摩擦', '动量', '冲量', '角动量', '力矩', '转动', '刚体', '圆周', '碰撞', '功率', '动能', '势能', '机械能', '斜面', '轨道', '滚动', '弹簧', '细杆', '小球', '重力', '质量', '参考系', '雨滴', '船')
  '热学与气体动理论' = @('热力学', '温度', '热量', '内能', '理想气体', '气体', '等温', '等压', '等体', '卡诺', '熵', '分子', '气缸', '自由度')
  '振动与波' = @('振动', '简谐', '谐振', '波动', '波长', '波速', '驻波', '相位', '声波', '多普勒')
  '静电场与电路' = @('电场', '田场', '电势', '电荷', '田荷', '静电', '电容', '高斯', '电偶极', '带电', '电场强度', '电势能', '电介质', '电流密度', '电通量', '通量')
  '磁场与电磁感应' = @('磁场', '磁感应', '安培', '洛伦兹', '毕奥', '霍尔', '磁通', '感应电动势', '电磁感应', '法拉第', '自感', '互感', '电动势', '载流', '线圈', '导线', '磁力矩')
  '光学' = @('光栅', '衍射', '偏振', '牛顿环', '迈克尔逊', '单缝', '双缝', '薄膜', '折射', '反射', '光程', '光的', '干涉')
  '近代物理' = @('相对论', '光电效应', '康普顿', '德布罗意', '量子', '波函数', '薛定谔', '不确定', '黑体', '原子', '核反应', '放射')
}

function Classify-Text([string]$Text) {
  $normalized = $Text.ToUpperInvariant().Replace('ZI', 'Z1')
  $chapters = @([regex]::Matches($normalized, 'Z(\d{1,2})') | ForEach-Object { [int]$_.Groups[1].Value })
  if (@($chapters | Where-Object { $_ -ge 10 -and $_ -le 14 }).Count -gt 0) {
    return [PSCustomObject]@{ Topic = '磁场与电磁感应'; Scores = [ordered]@{ chapter = ($chapters -join ',') } }
  }
  if (@($chapters | Where-Object { $_ -ge 6 -and $_ -le 9 }).Count -gt 0) {
    return [PSCustomObject]@{ Topic = '静电场与电路'; Scores = [ordered]@{ chapter = ($chapters -join ',') } }
  }
  if (@($chapters | Where-Object { $_ -ge 1 -and $_ -le 5 }).Count -gt 0) {
    return [PSCustomObject]@{ Topic = '力学'; Scores = [ordered]@{ chapter = ($chapters -join ',') } }
  }
  $scores = [ordered]@{}
  foreach ($topic in $topicKeywords.Keys) {
    $scores[$topic] = @($topicKeywords[$topic] | Where-Object { $Text.Contains($_) }).Count
  }
  $best = $scores.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 1
  if (-not $best -or $best.Value -eq 0) {
    return [PSCustomObject]@{ Topic = '待人工复核'; Scores = $scores }
  }
  return [PSCustomObject]@{ Topic = $best.Key; Scores = $scores }
}

$language = [Windows.Globalization.Language]::new('zh-Hans-CN')
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
if (-not $engine) {
  throw 'Windows Chinese OCR engine is unavailable.'
}

$images = @(
  Get-ChildItem -LiteralPath $SourceDir -File -Filter '*.png'
  $AdditionalImages | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-Item -LiteralPath $_ }
) | Sort-Object LastWriteTime, Name
$entries = [System.Collections.Generic.List[object]]::new()
$index = 0
foreach ($image in $images) {
  $index++
  $text = Get-OcrText $image.FullName $engine
  $classification = Classify-Text $text
  $entries.Add([PSCustomObject]@{
    index = $index
    file = $image.Name
    path = $image.FullName
    modified = $image.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
    topic = $classification.Topic
    scores = $classification.Scores
    text = $text
  })
  Write-Progress -Activity 'OCR indexing physics images' -Status "$index / $($images.Count)" -PercentComplete (($index / $images.Count) * 100)
}

$topicCounts = $entries | Group-Object topic | Sort-Object Name | ForEach-Object {
  [PSCustomObject]@{ topic = $_.Name; count = $_.Count }
}
$result = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  sourceDir = $SourceDir
  imageCount = $entries.Count
  topicCounts = $topicCounts
  entries = $entries
}

$parent = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
$result.topicCounts | Format-Table -AutoSize
Write-Output "Wrote OCR index: $OutputPath"
