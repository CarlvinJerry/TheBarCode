using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace TheBarcode.PrintBridge;

internal static class EscPosReceipt {
  public static byte[] Build(string text, int columns, bool cut) {
    var normalized = text.Replace("KES", "KES").Replace('–', '-').Replace('—', '-').Replace('…', '.');
    var lines = normalized.Replace("\r", "").Split('\n').SelectMany(line => Wrap(line, columns));
    using var stream = new MemoryStream();
    stream.Write([0x1B, 0x40]); // ESC @: initialize once.
    foreach(var line in lines){var trimmed=line.Trim();var bold=trimmed.StartsWith("STATUS: ",StringComparison.Ordinal);var signoff=trimmed=="Powered by TheBarcode | Beyond Raw Data";if(bold)stream.Write([0x1B,0x45,0x01]);if(signoff)stream.Write([0x1B,0x4D,0x01]);stream.Write(Encoding.ASCII.GetBytes(line+"\n"));if(bold)stream.Write([0x1B,0x45,0x00]);if(signoff)stream.Write([0x1B,0x4D,0x00]);}
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

  public static IReadOnlyList<string> GetInstalledPrinters() => GetLocalInstalledPrinters().Concat(GetConnectedPrinters()).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();

  public static IReadOnlyList<string> GetLocalInstalledPrinters() => EnumerateInstalled(PrinterEnumLocal);
  public static IReadOnlyList<string> GetConnectedPrinters() => EnumerateInstalled(PrinterEnumConnections);

  static IReadOnlyList<string> EnumerateInstalled(uint flags) {
    // Level 4 is fast and lightweight. Some older or vendor-managed printer
    // queues do not return entries at that level, so retry with level 1 before
    // reporting an empty printer list to the POS.
    var names = EnumeratePrinterNames(flags, 4, static item => Marshal.PtrToStructure<PrinterInfo4>(item).PrinterName);
    if (names.Count == 0)
      names = EnumeratePrinterNames(flags, 1, static item => Marshal.PtrToStructure<PrinterInfo1>(item).PrinterName);
    return names.Where(x => !string.IsNullOrWhiteSpace(x)).Cast<string>().Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();
  }

  static List<string?> EnumeratePrinterNames(uint flags, uint level, Func<IntPtr, string?> readName) {
    EnumPrinters(flags, null, level, IntPtr.Zero, 0, out var needed, out _);
    if (needed == 0) return [];
    var buffer = Marshal.AllocHGlobal((int)needed);
    try {
      if (!EnumPrinters(flags, null, level, buffer, needed, out _, out var returned))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      var size = level == 4 ? Marshal.SizeOf<PrinterInfo4>() : Marshal.SizeOf<PrinterInfo1>();
      return Enumerable.Range(0, (int)returned).Select(i => readName(buffer + i * size)).ToList();
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

  public static IReadOnlyList<string> GetQueue(string printerName) => EnumerateJobs(printerName).Where(x => IsTheBarcodeJob(x.Document)).Select(x => x.Document ?? "TheBarcode receipt").ToList();

  public static int ClearQueue(string printerName) {
    if (!OpenPrinter(printerName, out var printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      EnumJobs(printer, 0, 256, 1, IntPtr.Zero, 0, out var needed, out _);
      if (needed == 0) return 0;
      var buffer = Marshal.AllocHGlobal((int)needed);
      try {
        if (!EnumJobs(printer, 0, 256, 1, buffer, needed, out _, out var returned))
          throw new Win32Exception(Marshal.GetLastWin32Error());
        var size = Marshal.SizeOf<JobInfo1>();
        var removed = 0;
        for (var i = 0; i < returned; i++) {
          var job = Marshal.PtrToStructure<JobInfo1>(buffer + i * size);
          var document = job.Document == IntPtr.Zero ? "" : Marshal.PtrToStringUni(job.Document) ?? "";
          // Never touch unrelated Windows print jobs. TheBarcode only clears its own
          // receipts, which are submitted with this document prefix.
          if (job.JobId != 0 && IsTheBarcodeJob(document) && SetJob(printer, job.JobId, 0, IntPtr.Zero, 0x00000005)) removed++;
        }
        return removed;
      } finally { Marshal.FreeHGlobal(buffer); }
    } finally { ClosePrinter(printer); }
  }

  static IReadOnlyList<(uint JobId, string? Document)> EnumerateJobs(string printerName) {
    if (!OpenPrinter(printerName, out var printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      EnumJobs(printer, 0, 256, 1, IntPtr.Zero, 0, out var needed, out _);
      if (needed == 0) return [];
      var buffer = Marshal.AllocHGlobal((int)needed);
      try {
        if (!EnumJobs(printer, 0, 256, 1, buffer, needed, out _, out var returned)) throw new Win32Exception(Marshal.GetLastWin32Error());
        var size = Marshal.SizeOf<JobInfo1>();
        return Enumerable.Range(0, (int)returned).Select(i => { var job = Marshal.PtrToStructure<JobInfo1>(buffer + i * size); return (job.JobId, job.Document == IntPtr.Zero ? null : Marshal.PtrToStringUni(job.Document)); }).ToList();
      } finally { Marshal.FreeHGlobal(buffer); }
    } finally { ClosePrinter(printer); }
  }
  static bool IsTheBarcodeJob(string? document) => !string.IsNullOrWhiteSpace(document) && (document.Contains("TheBarcode", StringComparison.OrdinalIgnoreCase) || document.Contains("Dukora receipt", StringComparison.OrdinalIgnoreCase));

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PrinterInfo4 { [MarshalAs(UnmanagedType.LPWStr)] public string? PrinterName; [MarshalAs(UnmanagedType.LPWStr)] public string? ServerName; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PrinterInfo1 { public uint Flags; [MarshalAs(UnmanagedType.LPWStr)] public string? Description; [MarshalAs(UnmanagedType.LPWStr)] public string? PrinterName; [MarshalAs(UnmanagedType.LPWStr)] public string? Comment; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct JobInfo1 { public uint JobId; public IntPtr PrinterName; public IntPtr MachineName; public IntPtr UserName; public IntPtr Document; public IntPtr DataType; public IntPtr PrintProcessor; public IntPtr Parameters; public IntPtr DriverName; public IntPtr DevMode; public IntPtr Status; public uint StatusCode; public uint Priority; public uint Position; public uint TotalPages; public uint Size; public SystemTime Submitted; }
  [StructLayout(LayoutKind.Sequential)] struct SystemTime { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct DocInfo { [MarshalAs(UnmanagedType.LPWStr)] public string DocName; [MarshalAs(UnmanagedType.LPWStr)] public string? OutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string DataType; }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool EnumPrinters(uint flags, string? name, uint level, IntPtr info, uint size, out uint needed, out uint returned);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern int StartDocPrinter(IntPtr printer, int level, ref DocInfo info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EnumJobs(IntPtr printer, uint firstJob, uint noJobs, uint level, IntPtr buffer, uint bufferSize, out uint bytesNeeded, out uint jobsReturned);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool SetJob(IntPtr printer, uint jobId, uint level, IntPtr job, uint command);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);
}
