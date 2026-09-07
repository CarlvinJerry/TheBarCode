using System.Diagnostics;
using System.Net.Http;
using System.Security.Principal;
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
            ShowError("TheBarcode installed successfully, but its local server is not ready. Run TheBarcode again as Administrator or repair the installation.");
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
        var startInfo = new ProcessStartInfo("powershell.exe", arguments)
        {
            UseShellExecute = true,
            WorkingDirectory = installRoot
        };
        // Setup.exe is already elevated. Requesting a second UAC elevation
        // from inside Inno can be rejected by endpoint policy and makes a
        // successful configuration look like a cancellation. Only elevate
        // when the user later launches the app normally.
        if (!IsAdministrator()) startInfo.Verb = "runas";
        using var process = Process.Start(startInfo);
        process?.WaitForExit();
        if (process is null || process.ExitCode != 0)
        {
            var code = process is null ? "not started" : process.ExitCode.ToString();
            ShowError($"TheBarcode configuration failed (exit code {code}). Run TheBarcode again as Administrator or repair the installation.");
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

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string Quote(string value) => $"\"{value.Replace("\"", "\\\"")}\"";

    private static void ShowError(string message)
    {
        try { MessageBox.Show(message, "TheBarcode", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        catch { }
    }
}
