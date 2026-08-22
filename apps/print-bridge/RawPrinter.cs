using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace TheBarcode.PrintBridge;

internal static class EscPosReceipt {
  public static byte[] Build(string text, int columns, bool cut) {
    var normalized = text.Replace("KES", "KES").Replace('–', '-').Replace('—', '-').Replace('…', '.');
    var lines = normalized.Replace("\r", "").Split('\n').SelectMany(line => Wrap(line, columns));
    var body = Encoding.ASCII.GetBytes(string.Join("\n", lines) + "\n");
    using var stream = new MemoryStream();
    stream.Write([0x1B, 0x40]); // ESC @: initialize once.
    stream.Write(body);
    stream.Write([0x1B, 0x64, 0x04]); // Feed four lines, then stop.
    if (cut) stream.Write([0x1D, 0x56, 0x42, 0x00]);
    return stream.ToArray();
  }

  static IEnumerable<string> Wrap(string line, int columns) {
    if (line.Length == 0) { yield return ""; yield break; }
    for (var offset = 0; offset < line.Length; offset += columns)
      yield return line.Substring(offset, Math.Min(columns, line.Length - offset));
  }
}

internal static class RawPrinter {
  const uint PrinterEnumLocal = 0x00000002;
  const uint PrinterEnumConnections = 0x00000004;

  public static IReadOnlyList<string> GetInstalledPrinters() {
    EnumPrinters(PrinterEnumLocal | PrinterEnumConnections, null, 4, IntPtr.Zero, 0, out var needed, out _);
    if (needed == 0) return [];
    var buffer = Marshal.AllocHGlobal((int)needed);
    try {
      if (!EnumPrinters(PrinterEnumLocal | PrinterEnumConnections, null, 4, buffer, needed, out _, out var returned))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      var size = Marshal.SizeOf<PrinterInfo4>();
      return Enumerable.Range(0, (int)returned)
        .Select(i => Marshal.PtrToStructure<PrinterInfo4>(buffer + i * size).PrinterName)
        .Where(x => !string.IsNullOrWhiteSpace(x)).Cast<string>().Order().ToList();
    } finally { Marshal.FreeHGlobal(buffer); }
  }

  public static void Send(string printerName, byte[] bytes, string documentName) {
    if (!OpenPrinter(printerName, out var printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var info = new DocInfo { DocName = documentName, DataType = "RAW" };
      if (StartDocPrinter(printer, 1, ref info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          var unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
            if (!WritePrinter(printer, unmanaged, bytes.Length, out var written) || written != bytes.Length)
              throw new Win32Exception(Marshal.GetLastWin32Error());
          } finally { Marshal.FreeCoTaskMem(unmanaged); }
        } finally { EndPagePrinter(printer); }
      } finally { EndDocPrinter(printer); }
    } finally { ClosePrinter(printer); }
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PrinterInfo4 { [MarshalAs(UnmanagedType.LPWStr)] public string? PrinterName; [MarshalAs(UnmanagedType.LPWStr)] public string? ServerName; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct DocInfo { [MarshalAs(UnmanagedType.LPWStr)] public string DocName; [MarshalAs(UnmanagedType.LPWStr)] public string? OutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string DataType; }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool EnumPrinters(uint flags, string? name, uint level, IntPtr info, uint size, out uint needed, out uint returned);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern int StartDocPrinter(IntPtr printer, int level, ref DocInfo info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);
}
