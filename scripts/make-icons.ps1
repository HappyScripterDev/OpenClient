Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "assets\OcTransparent.png"
$buildDir = Join-Path $root "build"
$iconDir = Join-Path $buildDir "icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)
$sizes = @(16, 24, 32, 48, 64, 128, 256, 512, 1024)
$pngFiles = @{}

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $out = Join-Path $iconDir ("{0}x{0}.png" -f $size)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngFiles[$size] = $out
}

Copy-Item -LiteralPath $pngFiles[1024] -Destination (Join-Path $buildDir "icon.png") -Force
Copy-Item -LiteralPath $pngFiles[512] -Destination (Join-Path $buildDir "icon-mac.png") -Force
Copy-Item -LiteralPath $pngFiles[256] -Destination (Join-Path $buildDir "installerIcon.png") -Force
Copy-Item -LiteralPath $pngFiles[32] -Destination (Join-Path $buildDir "tray.png") -Force

$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$blobs = @()
foreach ($size in $icoSizes) {
  $blobs += ,([System.IO.File]::ReadAllBytes($pngFiles[$size]))
}

$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$icoSizes.Count)
$offset = 6 + 16 * $icoSizes.Count

for ($index = 0; $index -lt $icoSizes.Count; $index++) {
  $size = $icoSizes[$index]
  $dimension = if ($size -ge 256) { 0 } else { $size }
  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]0)
  $writer.Write([Byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$blobs[$index].Length)
  $writer.Write([UInt32]$offset)
  $offset += $blobs[$index].Length
}

foreach ($blob in $blobs) {
  $writer.Write($blob)
}

$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $buildDir "icon.ico"), $stream.ToArray())
$writer.Dispose()
$stream.Dispose()
$src.Dispose()

Write-Output "Generated OpenClient icons from OcTransparent.png"
