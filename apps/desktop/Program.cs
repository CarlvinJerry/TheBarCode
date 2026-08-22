using System.Diagnostics;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Dukora.Desktop;

internal static class Program
{
    const string AppUrl = "http://127.0.0.1:8090";
    static Process? api;
    static Process? bridge;

    [STAThread]
    static async Task Main()
    {
        using var single = new Mutex(true, "BeyondRawData.Dukora.Lite", out var first);
        if (!first) { MessageBox.Show("Dukora is already open.", "Dukora", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        ApplicationConfiguration.Initialize();
        try
        {
            var paths = AppPaths.Create();
            var configuration = LiteConfiguration.Load(paths.ConfigFile) ?? FirstRun(paths.ConfigFile);
            if (configuration is null) return;
            await EnsureApi(paths, configuration);
            StartPrintBridge(paths);
            Application.Run(new DukoraWindow(AppUrl, paths.WebViewData, paths.DesktopLog));
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Dukora could not start.\n\n{ex.Message}\n\nSee the Dukora Logs folder for details.", "Dukora startup", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            Stop(api);
            Stop(bridge);
        }
    }

    static LiteConfiguration? FirstRun(string file)
    {
        using var dialog = new PinDialog();
        if (dialog.ShowDialog() != DialogResult.OK) return null;
        var value = LiteConfiguration.Create(dialog.OwnerPin);
        value.Save(file);
        return value;
    }

    static async Task EnsureApi(AppPaths paths, LiteConfiguration config)
    {
        if (await IsHealthy()) return;
        var executable = Path.Combine(AppContext.BaseDirectory, "server", "TheBarcode.Api.exe");
        if (!File.Exists(executable)) throw new FileNotFoundException("The local API was not installed.", executable);
        var info = new ProcessStartInfo(executable, "--urls http://127.0.0.1:8090")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(executable)!,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        info.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        info.Environment["Database__Provider"] = "Sqlite";
        info.Environment["ConnectionStrings__Sqlite"] = $"Data Source={paths.DatabaseFile};Cache=Shared";
        info.Environment["Jwt__Key"] = config.JwtKey;
        info.Environment["Bootstrap__AdminPin"] = config.OwnerPin();
        info.Environment["AllowedOrigins__0"] = AppUrl;
        info.Environment["Release__Channel"] = "lite-windows";
        api = Process.Start(info) ?? throw new InvalidOperationException("The local API process could not be started.");
        _ = Pump(api.StandardOutput, paths.ApiLog);
        _ = Pump(api.StandardError, paths.ApiLog);
        for (var attempt = 0; attempt < 40; attempt++)
        {
            await Task.Delay(250);
            if (api.HasExited) throw new InvalidOperationException($"The local API stopped with exit code {api.ExitCode}.");
            if (await IsHealthy()) return;
        }
        throw new TimeoutException("The local API did not become ready on port 8090.");
    }

    static void StartPrintBridge(AppPaths paths)
    {
        var executable = Path.Combine(AppContext.BaseDirectory, "print-bridge", "TheBarcode.PrintBridge.exe");
        if (!File.Exists(executable)) return;
        bridge = Process.Start(new ProcessStartInfo(executable, "--urls http://127.0.0.1:17777") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(executable)! });
    }

    static async Task<bool> IsHealthy()
    {
        try { using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) }; var result = await client.GetFromJsonAsync<Health>($"{AppUrl}/api/health"); return result?.Status == "healthy"; }
        catch { return false; }
    }

    static async Task Pump(StreamReader reader, string file)
    {
        while (await reader.ReadLineAsync() is { } line) await File.AppendAllTextAsync(file, $"{DateTimeOffset.Now:O} {line}{Environment.NewLine}");
    }

    static void Stop(Process? process) { try { if (process is { HasExited: false }) process.Kill(true); } catch { } process?.Dispose(); }
    sealed record Health(string Status);
}

internal sealed class DukoraWindow : Form
{
    readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    readonly string url;
    readonly string userData;
    readonly string errorLog;
    public DukoraWindow(string url, string userData, string errorLog)
    {
        this.url = url; this.userData = userData; this.errorLog = errorLog;
        Text = "Dukora — Smarter Business Operations";
        Icon = new Icon(Path.Combine(AppContext.BaseDirectory, "dukora.ico"));
        MinimumSize = new Size(960, 640);
        WindowState = FormWindowState.Maximized;
        Controls.Add(browser);
        Shown += InitializeBrowser;
    }
    async void InitializeBrowser(object? sender, EventArgs e)
    {
        try
        {
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Navigate(url);
        }
        catch (Exception ex)
        {
            await File.AppendAllTextAsync(errorLog, $"{DateTimeOffset.Now:O} WebView2 initialization failed: {ex}{Environment.NewLine}");
            browser.Visible = false;
            var message = new Label { Text = "Dukora is running, but its embedded desktop view could not start.\nThe same interface has been opened in your default browser.\n\nClose this window when you finish using Dukora.", AutoSize = true, Font = new Font(Font.FontFamily, 13), TextAlign = ContentAlignment.MiddleCenter };
            var open = new Button { Text = "Open Dukora in browser", AutoSize = true, Padding = new Padding(16,8,16,8) };
            open.Click += (_, _) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            var fallback = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(50) };
            fallback.Controls.AddRange([message, open]); Controls.Add(fallback); fallback.BringToFront();
            open.PerformClick();
        }
    }
}

internal sealed class PinDialog : Form
{
    readonly TextBox pin = new() { UseSystemPasswordChar = true, Width = 260 };
    readonly TextBox confirm = new() { UseSystemPasswordChar = true, Width = 260 };
    public string OwnerPin => pin.Text;
    public PinDialog()
    {
        Text = "Set up Dukora Lite"; FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterScreen; MaximizeBox = false; MinimizeBox = false; ClientSize = new Size(390, 260);
        var title = new Label { Text = "Create the private owner PIN", Font = new Font(Font.FontFamily, 14, FontStyle.Bold), AutoSize = true };
        var note = new Label { Text = "Use at least 6 characters. This PIN protects the Owner account.", AutoSize = true, ForeColor = Color.DimGray };
        var save = new Button { Text = "Start Dukora", DialogResult = DialogResult.None, Width = 130, Height = 38 };
        save.Click += (_, _) => { if (pin.Text.Length < 6) MessageBox.Show("Use at least 6 characters."); else if (pin.Text != confirm.Text) MessageBox.Show("The PINs do not match."); else { DialogResult = DialogResult.OK; Close(); } };
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(28), WrapContents = false };
        layout.Controls.AddRange([title, note, new Label { Text = "Owner PIN", AutoSize = true, Margin = new Padding(0,18,0,3) }, pin, new Label { Text = "Confirm PIN", AutoSize = true, Margin = new Padding(0,10,0,3) }, confirm, save]);
        Controls.Add(layout); AcceptButton = save;
    }
}

internal sealed record AppPaths(string Root, string ConfigFile, string DatabaseFile, string ApiLog, string DesktopLog, string WebViewData)
{
    public static AppPaths Create()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Beyond Raw Data", "Dukora Lite");
        Directory.CreateDirectory(root); var logs = Path.Combine(root, "Logs"); Directory.CreateDirectory(logs);
        return new(root, Path.Combine(root,"configuration.json"), Path.Combine(root,"dukora.db"), Path.Combine(logs,"api.log"), Path.Combine(logs,"desktop.log"), Path.Combine(root,"WebView2"));
    }
}

internal sealed record LiteConfiguration(string JwtKey, string ProtectedOwnerPin)
{
    public static LiteConfiguration Create(string pin) => new(Convert.ToHexString(RandomNumberGenerator.GetBytes(48)), Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(pin), null, DataProtectionScope.CurrentUser)));
    public string OwnerPin() => Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(ProtectedOwnerPin), null, DataProtectionScope.CurrentUser));
    public void Save(string file) => File.WriteAllText(file, JsonSerializer.Serialize(this));
    public static LiteConfiguration? Load(string file) { try { return File.Exists(file) ? JsonSerializer.Deserialize<LiteConfiguration>(File.ReadAllText(file)) : null; } catch { return null; } }
}
