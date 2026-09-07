using System.Diagnostics;
using System.Net.Http;
using System.Text;

namespace TheBarcode.Launcher;

internal static class Program
{
    private const string ApiUrl = "http://127.0.0.1:8088";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var installRoot = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            if (args.Any(x => x.Equals("--configure", StringComparison.OrdinalIgnoreCase)))
            {
                var configured = RunConfiguration(installRoot);
                if (!configured) return 1;
            }

            if (!IsHealthy())
            {
                if (!ServiceExists())
                {
                    if (!RunConfiguration(installRoot)) return 1;
                }
                else
                {
                    TryStartService();
                }
            }

            if (!WaitForHealth())
            {
                ShowError("TheBarcode installed successfully, but its local server is not ready. Open the Configure TheBarcode shortcut as Administrator, then try again.");
                return 1;
            }

            Process.Start(new ProcessStartInfo($"{ApiUrl}/") { UseShellExecute = true });
            return 0;
        }
        catch (Exception ex)
        {
            ShowError($"TheBarcode could not start.\n\n{ex.Message}");
            return 1;
        }
    }

    private static bool RunConfiguration(string installRoot)
    {
        var script = Path.Combine(installRoot, "tools", "configure-native.ps1");
        if (!File.Exists(script))
        {
            ShowError("TheBarcode configuration tool is missing. Repair or reinstall TheBarcode.");
            return false;
        }

        var arguments = new StringBuilder()
            .Append("-NoProfile -ExecutionPolicy Bypass -File ")
            .Append(Quote(script))
            .Append(" -InstallRoot ")
            .Append(Quote(installRoot))
            .ToString();
        using var process = Process.Start(new ProcessStartInfo("powershell.exe", arguments)
        {
            UseShellExecute = true,
            Verb = "runas",
            WorkingDirectory = installRoot
        });
        process?.WaitForExit();
        if (process is null || process.ExitCode != 0)
        {
            ShowError("TheBarcode configuration was cancelled or failed. Run the Configure TheBarcode shortcut as Administrator and retry.");
            return false;
        }
        return true;
    }

    private static bool ServiceExists()
    {
        using var process = Process.Start(new ProcessStartInfo("sc.exe", "query TheBarcodeApi")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });
        process?.WaitForExit(3000);
        return process?.ExitCode == 0;
    }

    private static void TryStartService()
    {
        using var process = Process.Start(new ProcessStartInfo("sc.exe", "start TheBarcodeApi")
        {
            UseShellExecute = true,
            Verb = "runas",
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
        process?.WaitForExit(10000);
    }

    private static bool IsHealthy()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(700) };
            using var response = client.GetAsync($"{ApiUrl}/api/health").GetAwaiter().GetResult();
            return response.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    private static bool WaitForHealth()
    {
        for (var attempt = 0; attempt < 30; attempt++)
        {
            if (IsHealthy()) return true;
            Thread.Sleep(500);
        }
        return false;
    }

    private static string Quote(string value) => $"\"{value.Replace("\"", "\\\"")}\"";

    private static void ShowError(string message)
    {
        try { MessageBox.Show(message, "TheBarcode", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        catch { }
    }
}
