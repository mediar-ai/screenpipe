// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
using System;
using System.Runtime.InteropServices;
using System.Threading;

static class UacClick {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [STAThread] static void Main(string[] args) {
    bool yes = args.Length == 0 || !String.Equals(args[0], "No", StringComparison.OrdinalIgnoreCase);
    SetCursorPos(yes ? 410 : 615, 546);
    mouse_event(2, 0, 0, 0, UIntPtr.Zero); mouse_event(4, 0, 0, 0, UIntPtr.Zero);
    Thread.Sleep(500);
    byte direction = yes ? (byte)0x25 : (byte)0x27;
    keybd_event(direction, 0, 0, UIntPtr.Zero); keybd_event(direction, 0, 2, UIntPtr.Zero);
    keybd_event(0x0D, 0, 0, UIntPtr.Zero); keybd_event(0x0D, 0, 2, UIntPtr.Zero);
    Thread.Sleep(30000);
  }
}
