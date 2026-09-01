using System.Diagnostics;

namespace Dukora.DriverInstaller;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        try
        {
            var driver = Path.Combine(AppContext.BaseDirectory, "driver", "Xprinter-Receipt-Driver-2025.12.22.01.exe");
            if (!File.Exists(driver)) throw new FileNotFoundException("The bundled Xprinter driver was not found.", driver);
            using var setup = Process.Start(new ProcessStartInfo(driver) { UseShellExecute = true }) ?? throw new InvalidOperationException("Windows could not start the Xprinter driver setup.");
            setup.WaitForExit();
            if (setup.ExitCode is not (0 or 1641 or 3010)) throw new InvalidOperationException($"Xprinter setup exited with code {setup.ExitCode}.");
            MessageBox.Show("Xprinter setup completed. Select the installed XP-80 printer in TheBarcode Settings.", "TheBarcode printer setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "TheBarcode printer setup", MessageBoxButtons.OK, MessageBoxIcon.Error); Environment.ExitCode = 1; }
    }
}
