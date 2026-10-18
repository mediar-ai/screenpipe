# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
param(
  [Parameter(Mandatory)] [string] $Output,
  [Parameter(Mandatory)] [string] $StopFile,
  [string] $ReadyFile = "$Output.ready"
)

$ErrorActionPreference = "Stop"
Remove-Item -LiteralPath $StopFile, $ReadyFile -Force -ErrorAction SilentlyContinue
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = "ffmpeg.exe"
$startInfo.ArgumentList.Add("-y")
$startInfo.ArgumentList.Add("-loglevel")
$startInfo.ArgumentList.Add("warning")
$startInfo.ArgumentList.Add("-f")
$startInfo.ArgumentList.Add("gdigrab")
$startInfo.ArgumentList.Add("-framerate")
$startInfo.ArgumentList.Add("15")
$startInfo.ArgumentList.Add("-draw_mouse")
$startInfo.ArgumentList.Add("1")
$startInfo.ArgumentList.Add("-i")
$startInfo.ArgumentList.Add("desktop")
$startInfo.ArgumentList.Add("-c:v")
$startInfo.ArgumentList.Add("libx264")
$startInfo.ArgumentList.Add("-preset")
$startInfo.ArgumentList.Add("ultrafast")
$startInfo.ArgumentList.Add("-pix_fmt")
$startInfo.ArgumentList.Add("yuv420p")
$startInfo.ArgumentList.Add($Output)
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
if (-not $process.Start()) { throw "failed to start ffmpeg" }
Set-Content -LiteralPath $ReadyFile -Value $process.Id -Encoding ascii
try {
  while (-not $process.HasExited -and -not (Test-Path -LiteralPath $StopFile)) {
    Start-Sleep -Milliseconds 250
  }
  if (-not $process.HasExited) {
    $process.StandardInput.WriteLine("q")
    if (-not $process.WaitForExit(15000)) { throw "ffmpeg did not stop after targeted q" }
  }
  if ($process.ExitCode -ne 0) { throw "ffmpeg exited with $($process.ExitCode)" }
} finally {
  $process.Dispose()
}
