# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
param([ValidateSet("Yes", "No")] [string] $Choice = "Yes")

Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class SessionLauncher {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved, desktop, title; public int x,y,xs,ys,xc,yc,flags,show; public short r2; public IntPtr r2p,stdin,stdout,stderr; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public int processId, threadId; }
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool DuplicateTokenEx(IntPtr token, uint access, IntPtr attrs, int level, int type, out IntPtr duplicate);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr token, string app, string command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  public static void Run(string command) {
    var winlogon = Process.GetProcessesByName("winlogon")[0]; IntPtr token, duplicate;
    if (!OpenProcessToken(winlogon.Handle, 0x0002 | 0x0008 | 0x0001 | 0x0080, out token)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    if (!DuplicateTokenEx(token, 0xF01FF, IntPtr.Zero, 2, 1, out duplicate)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    var si = new STARTUPINFO { cb = Marshal.SizeOf(typeof(STARTUPINFO)), desktop = "winsta0\\Default" }; PROCESS_INFORMATION pi;
    if (!CreateProcessAsUser(duplicate, null, command, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
}
"@
$helper = "C:\screenpipe-worker\results\win-install-video-20261014\uac-click.exe $Choice"
[SessionLauncher]::Run($helper)
