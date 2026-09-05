param(
  [Parameter(Mandatory = $true)]
  [int]$ProcessId,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WindowCaptureNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

Add-Type -AssemblyName System.Drawing
$targetProcess = Get-Process -Id $ProcessId
[WindowCaptureNative]::ShowWindow($targetProcess.MainWindowHandle, 5) | Out-Null
[WindowCaptureNative]::SetForegroundWindow($targetProcess.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 250
$bounds = New-Object WindowCaptureNative+RECT
if (-not [WindowCaptureNative]::GetWindowRect($targetProcess.MainWindowHandle, [ref]$bounds)) {
  throw "Unable to read the application window bounds."
}
$width = $bounds.Right - $bounds.Left
$height = $bounds.Bottom - $bounds.Top
[WindowCaptureNative]::SetCursorPos($bounds.Left + [int]($width / 2), $bounds.Top + [int]($height / 2)) | Out-Null
Start-Sleep -Milliseconds 350
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "$width x $height -> $OutputPath"
