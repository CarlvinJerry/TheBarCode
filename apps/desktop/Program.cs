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
    const string PrintBridgeUrl = "http://127.0.0.1:17778";
    static Process? api;
    static Process? bridge;

    [STAThread]
    static void Main()
    {
        using var single = new Mutex(true, "BeyondRawData.TheBarcode", out var first);
        if (!first) { MessageBox.Show("TheBarcode is already open.", "TheBarcode", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
        ApplicationConfiguration.Initialize();
        try
        {
            var paths = AppPaths.Create();
            var configuration = LiteConfiguration.Load(paths.ConfigFile) ?? FirstRun(paths.ConfigFile);
            if (configuration is null) return;
            BackupDatabase(paths);
            // Keep the WinForms/WebView2 message loop on this original STA thread.
            // Awaiting in Main can resume on an MTA worker before Application.Run.
            Task.Run(() => EnsureApi(paths, configuration)).GetAwaiter().GetResult();
            Task.Run(() => StartPrintBridge(paths)).GetAwaiter().GetResult();
            Application.Run(new DukoraWindow(AppUrl, paths));
        }
        catch (Exception ex)
        {
            var paths = AppPaths.Create();
            LogStartupFailure(paths, ex).GetAwaiter().GetResult();
            // A slow machine can still bring the local service online after a
            // desktop startup step times out. Keep it alive while the browser
            // fallback is in use; closing the fallback window stops it cleanly.
            if (WaitForApi(TimeSpan.FromSeconds(30)).GetAwaiter().GetResult())
            {
                try
                {
                    var fallbackUrl = $"{AppUrl}/?printBridgePort=17778";
                    OpenBrowser(fallbackUrl);
                    Application.Run(new BrowserFallbackWindow(fallbackUrl));
                }
                catch (Exception fallbackError)
                {
                    LogStartupFailure(paths, fallbackError).GetAwaiter().GetResult();
                    MessageBox.Show($"TheBarcode is running, but neither its desktop window nor browser could be opened.\n\n{fallbackError.Message}\n\nSee the TheBarcode Logs folder for details.", "TheBarcode startup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else
            {
                MessageBox.Show($"TheBarcode could not start.\n\n{ex.Message}\n\nSee the TheBarcode Logs folder for details.", "TheBarcode startup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        finally
        {
            Stop(api);
            Stop(bridge);
        }
    }

    static async Task<bool> WaitForApi(TimeSpan timeout)
    {
        var elapsed = Stopwatch.StartNew();
        while (elapsed.Elapsed < timeout)
        {
            if (await IsHealthy()) return true;
            if (api is { HasExited: true }) return false;
            await Task.Delay(500);
        }
        return await IsHealthy();
    }

    internal static void OpenBrowser(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    static async Task LogStartupFailure(AppPaths paths, Exception ex)
    {
        var details = $"{DateTimeOffset.Now:O} Desktop startup failed | type={ex.GetType().FullName} | hresult=0x{ex.HResult:X8} | message={ex.Message}{Environment.NewLine}{ex}{Environment.NewLine}";
        try { await File.AppendAllTextAsync(paths.DesktopLog, details); } catch { }
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
        // WAL gives the local POS concurrent readers during short writes. Shared
        // cache works against WAL's isolation and may surface stale reads.
        info.Environment["ConnectionStrings__Sqlite"] = $"Data Source={paths.DatabaseFile};Cache=Private;Default Timeout=10";
        info.Environment["Jwt__Key"] = config.JwtKey;
        info.Environment["Bootstrap__AdminPin"] = config.OwnerPin();
        info.Environment["AllowedOrigins__0"] = AppUrl;
        info.Environment["Release__Channel"] = "lite-windows";
        info.Environment["Maintenance__BackupDirectory"] = paths.BackupDir;
        api = Process.Start(info) ?? throw new InvalidOperationException("The local API process could not be started.");
        _ = Pump(api.StandardOutput, paths.ApiLog);
        _ = Pump(api.StandardError, paths.ApiLog);
        // Give slower office laptops enough time for SQLite migrations and
        // first-run indexing before treating API readiness as a hard failure.
        for (var attempt = 0; attempt < 120; attempt++)
        {
            await Task.Delay(250);
            if (api.HasExited) throw new InvalidOperationException($"The local API stopped with exit code {api.ExitCode}.");
            if (await IsHealthy()) return;
        }
        throw new TimeoutException("The local API did not become ready on port 8090.");
    }

    static async Task StartPrintBridge(AppPaths paths)
    {
        var executable = Path.Combine(AppContext.BaseDirectory, "print-bridge", "TheBarcode.PrintBridge.exe");
        if (!File.Exists(executable))
        {
            await File.AppendAllTextAsync(paths.DesktopLog, $"{DateTimeOffset.Now:O} Receipt print bridge was not installed: {executable}{Environment.NewLine}");
            return;
        }
        bridge = Process.Start(new ProcessStartInfo(executable, "--urls http://127.0.0.1:17778") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(executable)! });
        // Do not show the POS until the silent-print endpoint is ready. Without
        // this check the first receipt can race bridge startup and fall through
        // to Chromium's Windows print dialog.
        using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
        for (var attempt = 0; attempt < 16; attempt++)
        {
            try
            {
                using var response = await client.GetAsync($"{PrintBridgeUrl}/health");
                if (response.IsSuccessStatusCode) return;
            }
            catch { }
            if (bridge is { HasExited: true }) break;
            await Task.Delay(250);
        }
        var exit = bridge is { HasExited: true } ? $" Process exit code: {bridge.ExitCode}." : "";
        await File.AppendAllTextAsync(paths.DesktopLog, $"{DateTimeOffset.Now:O} Receipt print bridge did not become ready at {PrintBridgeUrl}; receipts will use the browser print fallback.{exit}{Environment.NewLine}");
    }

    static void BackupDatabase(AppPaths paths)
    {
        if (!File.Exists(paths.DatabaseFile) || new FileInfo(paths.DatabaseFile).Length == 0) return;
        Directory.CreateDirectory(paths.BackupDir);
        var daily = Path.Combine(paths.BackupDir, $"thebarcode-{DateTime.Today:yyyyMMdd}.db");
        if (!File.Exists(daily)) File.Copy(paths.DatabaseFile, daily);
        foreach (var old in Directory.GetFiles(paths.BackupDir, "thebarcode-*.db").OrderByDescending(File.GetCreationTimeUtc).Skip(14)) File.Delete(old);
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

    internal static async Task RestoreBackup(AppPaths paths,string fileName)
    {
        var safeName=Path.GetFileName(fileName);var source=Path.GetFullPath(Path.Combine(paths.BackupDir,safeName));var root=Path.GetFullPath(paths.BackupDir)+Path.DirectorySeparatorChar;
        if(string.IsNullOrWhiteSpace(safeName)||!source.StartsWith(root,StringComparison.OrdinalIgnoreCase)||!File.Exists(source))throw new FileNotFoundException("The selected backup no longer exists.");
        Stop(api);Stop(bridge);File.Copy(source,paths.DatabaseFile,true);foreach(var suffix in new[]{"-wal","-shm"})if(File.Exists(paths.DatabaseFile+suffix))File.Delete(paths.DatabaseFile+suffix);
        var configuration=LiteConfiguration.Load(paths.ConfigFile)??throw new InvalidOperationException("TheBarcode configuration could not be loaded.");await EnsureApi(paths,configuration);await StartPrintBridge(paths);
    }
    static void Stop(Process? process) { try { if (process is { HasExited: false }) process.Kill(true); } catch { } process?.Dispose(); }
    sealed record Health(string Status);
}

internal sealed class DukoraWindow : Form
{
    readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    readonly string url;
    readonly AppPaths paths;
    int updateInProgress;
    public DukoraWindow(string url, AppPaths paths)
    {
        this.url = url; this.paths = paths;
        Text = "TheBarcode — Smarter Business Operations";
        Icon = new Icon(Path.Combine(AppContext.BaseDirectory, "thebarcode.ico"));
        MinimumSize = new Size(960, 640);
        WindowState = FormWindowState.Maximized;
        Controls.Add(browser);
        Shown += InitializeBrowser;
    }
    async void InitializeBrowser(object? sender, EventArgs e)
    {
        try
        {
            // Probe and log the runtime separately so missing/corrupt WebView2
            // installations produce an actionable diagnostic. The browser
            // fallback below remains the last-resort path.
            string? runtimeVersion = null;
            try
            {
                runtimeVersion = CoreWebView2Environment.GetAvailableBrowserVersionString();
                await LogWebViewEvent($"WebView2 runtime detected: {runtimeVersion}; user-data: {paths.WebViewData}");
            }
            catch (Exception probe)
            {
                await LogWebViewFailure(paths, "runtime probe", probe);
                throw;
            }
            var environment = await CoreWebView2Environment.CreateAsync(null, paths.WebViewData);
            await LogWebViewEvent($"WebView2 environment created; runtime: {runtimeVersion}; user-data: {paths.WebViewData}");
            await browser.EnsureCoreWebView2Async(environment);
            await LogWebViewEvent("WebView2 controller initialized successfully");
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.WebMessageReceived += HandleWebMessage;
            browser.CoreWebView2.Navigate(url);
        }
        catch (Exception ex)
        {
            await LogWebViewFailure(paths, "initialization", ex);
            browser.Visible = false;
            var message = new Label { Text = "TheBarcode is running, but its embedded desktop view could not start.\nThe same interface has been opened in your default browser.\n\nClose this window when you finish using TheBarcode.", AutoSize = true, Font = new Font(Font.FontFamily, 13), TextAlign = ContentAlignment.MiddleCenter };
            var open = new Button { Text = "Open TheBarcode in browser", AutoSize = true, Padding = new Padding(16,8,16,8) };
            open.Click += (_, _) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            var fallback = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(50) };
            fallback.Controls.AddRange([message, open]); Controls.Add(fallback); fallback.BringToFront();
            open.PerformClick();
        }
    }
    async Task LogWebViewEvent(string message)
    {
        try { await File.AppendAllTextAsync(paths.DesktopLog, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}"); } catch { }
    }

    static async Task LogWebViewFailure(AppPaths paths, string phase, Exception ex)
    {
        var hresult = $"0x{ex.HResult:X8}";
        var details = $"{DateTimeOffset.Now:O} WebView2 {phase} failed | type={ex.GetType().FullName} | hresult={hresult} | message={ex.Message}{Environment.NewLine}{ex}{Environment.NewLine}";
        try { await File.AppendAllTextAsync(paths.DesktopLog, details); } catch { }
    }
    async void HandleWebMessage(object? sender,CoreWebView2WebMessageReceivedEventArgs e)
    {
        if(!Uri.TryCreate(e.Source,UriKind.Absolute,out var source)||source.Host!="127.0.0.1"||source.Port!=8090)return;
        DesktopCommand? command;try{command=JsonSerializer.Deserialize<DesktopCommand>(e.WebMessageAsJson,new JsonSerializerOptions{PropertyNameCaseInsensitive=true});}catch{return;}
        if(command?.Command=="restoreBackup")
        {
            try{if(MessageBox.Show($"Restore {command.FileName}?\n\nCurrent records will be replaced by this backup and TheBarcode will reload.","Restore TheBarcode backup",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes){Reply(false,"Restore cancelled","dukoraRestore");return;}await Dukora.Desktop.Program.RestoreBackup(paths,command.FileName??"");Reply(true,"Backup restored. TheBarcode is reloading.","dukoraRestore");browser.CoreWebView2.Navigate(url);}catch(Exception ex){Reply(false,ex.Message,"dukoraRestore");}return;
        }
        if(command?.Command!="installUpdate")return;
        if(Interlocked.CompareExchange(ref updateInProgress,1,0)!=0)return;
        try
        {
            if(!Uri.TryCreate(command.DownloadUrl,UriKind.Absolute,out var download)||download.Scheme!="https"||!TrustedReleaseHost(download.Host))throw new InvalidOperationException("The release URL is not an approved HTTPS release host.");
            if(string.IsNullOrWhiteSpace(command.Sha256)||command.Sha256.Length!=64)throw new InvalidOperationException("The release manifest does not contain a valid SHA-256 checksum.");
            var updates=Path.Combine(paths.Root,"Updates");Directory.CreateDirectory(updates);var installer=Path.Combine(updates,$"TheBarcode-Setup-{SafeVersion(command.Version??"update")}-x64.exe");
            ReportUpdateProgress(0,0,"Connecting to update service");
            using(var client=new HttpClient{Timeout=TimeSpan.FromMinutes(15)})
            using(var response=await client.GetAsync(download,HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                var total=response.Content.Headers.ContentLength??0;
                await using var input=await response.Content.ReadAsStreamAsync();
                await using var output=File.Create(installer);
                var buffer=new byte[128*1024];long received=0,lastReported=0;
                ReportUpdateProgress(0,total,"Downloading update");
                while(true)
                {
                    var count=await input.ReadAsync(buffer);
                    if(count==0)break;
                    await output.WriteAsync(buffer.AsMemory(0,count));received+=count;
                    if(received-lastReported>=1024*1024||(total>0&&received>=total)){ReportUpdateProgress(received,total,"Downloading update");lastReported=received;}
                }
            }
            ReportUpdateProgress(0,0,"Verifying update");
            await using(var stream=File.OpenRead(installer)){var actual=Convert.ToHexString(await SHA256.HashDataAsync(stream));if(!actual.Equals(command.Sha256,StringComparison.OrdinalIgnoreCase)){File.Delete(installer);throw new InvalidOperationException("The downloaded installer failed checksum verification and was deleted.");}}
            ReportUpdateProgress(0,0,"Backing up business data");
            if(File.Exists(paths.DatabaseFile)){Directory.CreateDirectory(paths.BackupDir);File.Copy(paths.DatabaseFile,Path.Combine(paths.BackupDir,$"thebarcode-before-update-{DateTime.Now:yyyyMMdd-HHmmss}.db"),true);}
            ReportUpdateProgress(100,100,"Starting installer");
            Reply(true,$"TheBarcode {command.Version} verified. Windows will now request permission to install it.");
            Process.Start(new ProcessStartInfo(installer,"/VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS"){UseShellExecute=true,Verb="runas",WorkingDirectory=updates});
            await Task.Delay(700);BeginInvoke(Application.Exit);
        }
        catch(Exception ex){Interlocked.Exchange(ref updateInProgress,0);await File.AppendAllTextAsync(paths.DesktopLog,$"{DateTimeOffset.Now:O} Update failed: {ex}{Environment.NewLine}");Reply(false,ex.Message);}
    }
    void Reply(bool ok,string message,string type="dukoraUpdate")=>browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new{type,ok,message}));
    void ReportUpdateProgress(long received,long total,string status)
    {
        try{browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new{type="dukoraUpdateProgress",receivedBytes=received,totalBytes=total,status}));}catch{}
    }
    static bool TrustedReleaseHost(string host)=>host.Equals("beyondrawdata.com",StringComparison.OrdinalIgnoreCase)||host.EndsWith(".beyondrawdata.com",StringComparison.OrdinalIgnoreCase)||host.Equals("beyondrawdata.co.ke",StringComparison.OrdinalIgnoreCase)||host.EndsWith(".beyondrawdata.co.ke",StringComparison.OrdinalIgnoreCase)||host.Equals("drive.google.com",StringComparison.OrdinalIgnoreCase)||host.Equals("drive.usercontent.google.com",StringComparison.OrdinalIgnoreCase)||host.Equals("github.com",StringComparison.OrdinalIgnoreCase)||host.Equals("release-assets.githubusercontent.com",StringComparison.OrdinalIgnoreCase)||host.Equals("objects.githubusercontent.com",StringComparison.OrdinalIgnoreCase);
    static string SafeVersion(string value)=>string.Concat(value.Where(x=>char.IsAsciiLetterOrDigit(x)||x is '.' or '-' or '_'));
    sealed record DesktopCommand(string Command,string? Version,string? DownloadUrl,string? Sha256,string? FileName);
}

internal sealed class BrowserFallbackWindow : Form
{
    readonly string url;
    public BrowserFallbackWindow(string url)
    {
        this.url = url;
        Text = "TheBarcode is open in your browser";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(560, 210);

        var message = new Label
        {
            Text = "The desktop window could not start, so TheBarcode opened in your browser.\nKeep this small window open while you use it; closing this window also stops TheBarcode.",
            AutoSize = true,
            Font = new Font(Font.FontFamily, 11),
            Location = new Point(28, 30)
        };
        var reopen = new Button { Text = "Open TheBarcode again", AutoSize = true, Height = 42, Location = new Point(28, 125) };
        reopen.Click += (_, _) => Program.OpenBrowser(url);
        var close = new Button { Text = "Close TheBarcode", AutoSize = true, Height = 42, Location = new Point(390, 125) };
        close.Click += (_, _) => Close();
        Controls.AddRange([message, reopen, close]);
        AcceptButton = reopen;
        CancelButton = close;
    }
}

internal sealed class PinDialog : Form
{
    readonly TextBox pin = new() { UseSystemPasswordChar = true, Width = 260 };
    readonly TextBox confirm = new() { UseSystemPasswordChar = true, Width = 260 };
    public string OwnerPin => pin.Text;
    public PinDialog()
    {
        Text = "Set up TheBarcode Lite"; FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterScreen; MaximizeBox = false; MinimizeBox = false; ClientSize = new Size(390, 260);
        var title = new Label { Text = "Create the private owner PIN", Font = new Font(Font.FontFamily, 14, FontStyle.Bold), AutoSize = true };
        var note = new Label { Text = "Use at least 6 characters. This PIN protects the Owner account.", AutoSize = true, ForeColor = Color.DimGray };
        var save = new Button { Text = "Start TheBarcode", DialogResult = DialogResult.None, Width = 130, Height = 38 };
        save.Click += (_, _) => { if (pin.Text.Length < 6) MessageBox.Show("Use at least 6 characters."); else if (pin.Text != confirm.Text) MessageBox.Show("The PINs do not match."); else { DialogResult = DialogResult.OK; Close(); } };
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(28), WrapContents = false };
        layout.Controls.AddRange([title, note, new Label { Text = "Owner PIN", AutoSize = true, Margin = new Padding(0,18,0,3) }, pin, new Label { Text = "Confirm PIN", AutoSize = true, Margin = new Padding(0,10,0,3) }, confirm, save]);
        Controls.Add(layout); AcceptButton = save;
    }
}

internal sealed record AppPaths(string Root, string ConfigFile, string DatabaseFile, string ApiLog, string DesktopLog, string WebViewData,string BackupDir)
{
    public static AppPaths Create()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Beyond Raw Data", "TheBarcode");
        var baseRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Beyond Raw Data");
        foreach (var legacyName in new[] { "Dukora Lite", "Dukora" })
            MigrateLegacyRoot(Path.Combine(baseRoot, legacyName), root);
        Directory.CreateDirectory(root); var logs = Path.Combine(root, "Logs"); Directory.CreateDirectory(logs);
        var database = Path.Combine(root,"thebarcode.db");
        var legacyDatabase = Path.Combine(root,"dukora.db");
        if (!File.Exists(database) && File.Exists(legacyDatabase)) File.Move(legacyDatabase, database);
        return new(root, Path.Combine(root,"configuration.json"), database, Path.Combine(logs,"api.log"), Path.Combine(logs,"desktop.log"), Path.Combine(root,"WebView2"),Path.Combine(root,"Backups"));
    }

    static void MigrateLegacyRoot(string legacy, string current)
    {
        if (!Directory.Exists(legacy) || string.Equals(legacy,current,StringComparison.OrdinalIgnoreCase)) return;
        Directory.CreateDirectory(current);
        foreach (var entry in Directory.GetFileSystemEntries(legacy))
        {
            var target = Path.Combine(current, Path.GetFileName(entry));
            if (File.Exists(entry) && !File.Exists(target)) File.Copy(entry,target);
            else if (Directory.Exists(entry)) MergeMissingEntries(entry,target);
        }
    }

    static void MergeMissingEntries(string source, string target)
    {
        Directory.CreateDirectory(target);
        foreach (var entry in Directory.GetFileSystemEntries(source))
        {
            var destination = Path.Combine(target, Path.GetFileName(entry));
            if (File.Exists(entry) && !File.Exists(destination)) File.Copy(entry,destination);
            else if (Directory.Exists(entry))
            {
                if (!Directory.Exists(destination)) Directory.CreateDirectory(destination);
                MergeMissingEntries(entry,destination);
            }
        }
    }
}

internal sealed record LiteConfiguration(string JwtKey, string ProtectedOwnerPin)
{
    public static LiteConfiguration Create(string pin) => new(Convert.ToHexString(RandomNumberGenerator.GetBytes(48)), Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(pin), null, DataProtectionScope.CurrentUser)));
    public string OwnerPin() => Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(ProtectedOwnerPin), null, DataProtectionScope.CurrentUser));
    public void Save(string file) => File.WriteAllText(file, JsonSerializer.Serialize(this));
    public static LiteConfiguration? Load(string file) { try { return File.Exists(file) ? JsonSerializer.Deserialize<LiteConfiguration>(File.ReadAllText(file)) : null; } catch { return null; } }
}
