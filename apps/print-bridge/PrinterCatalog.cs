using Microsoft.Extensions.Hosting;

namespace TheBarcode.PrintBridge;

internal sealed class PrinterCatalog(ILogger<PrinterCatalog> logger) : BackgroundService
{
    static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(30);
    string[] printers = [];
    string? lastError;
    bool hasCompletedScan;

    public IReadOnlyList<string> Printers => Volatile.Read(ref printers);
    public string? LastError => Volatile.Read(ref lastError);
    public bool HasCompletedScan => Volatile.Read(ref hasCompletedScan);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Windows printer enumeration can pause for a long time while
                // disconnected network queues or the spooler are recovering.
                // Keep that work off the HTTP request path and retain the last
                // good list so a slow scan does not make the bridge look down.
                var local = await Task.Run(RawPrinter.GetLocalInstalledPrinters, stoppingToken);
                Volatile.Write(ref printers, local.ToArray());
                var connections = await Task.Run(RawPrinter.GetConnectedPrinters, stoppingToken);
                var discovered = local.Concat(connections).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
                Volatile.Write(ref printers, discovered.ToArray());
                Volatile.Write(ref lastError, null);
                logger.LogInformation("Printer discovery completed: {Count} installed queue(s).", discovered.Length);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Volatile.Write(ref lastError, ex.Message);
                logger.LogWarning(ex, "Windows printer discovery failed; keeping the last known printer list.");
            }
            finally
            {
                Volatile.Write(ref hasCompletedScan, true);
            }

            try { await Task.Delay(RefreshInterval, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
