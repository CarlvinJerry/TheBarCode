using System.Security.Claims;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class MaintenanceEndpoints
{
    public static void MapMaintenanceApi(this WebApplication app)
    {
        var group = app.MapGroup("/api/maintenance").RequireAuthorization(p => p.RequireRole("Owner"));
        group.MapGet("/backups", (IConfiguration configuration) =>
        {
            var directory = BackupDirectory(configuration);
            Directory.CreateDirectory(directory);
            return Directory.GetFiles(directory, "dukora-manual-*.db")
                .Select(path => new FileInfo(path))
                .OrderByDescending(x => x.CreationTimeUtc)
                .Select(x => new { fileName = x.Name, createdAt = x.CreationTimeUtc, sizeBytes = x.Length });
        });
        group.MapPost("/backup", async (AppDbContext db, IConfiguration configuration) =>
        {
            var backup = await CreateBackup(db, configuration, "manual");
            return Results.Ok(backup);
        });
        group.MapPost("/purge", async (PurgeRequest request, AppDbContext db, IConfiguration configuration, ClaimsPrincipal principal) =>
        {
            if (request.Confirmation != "PURGE LIVE DATA") return Results.BadRequest(new { error = "Type PURGE LIVE DATA exactly to confirm." });
            var backup = await CreateBackup(db, configuration, "before-purge");
            await using var transaction = await db.Database.BeginTransactionAsync();
            var liveProductIds = await db.Products.Where(x => !x.IsDemo).Select(x => x.Id).ToListAsync();
            var liveSaleIds = await db.Sales.Where(x => !x.IsDemo).Select(x => x.Id).ToListAsync();
            var counts = new
            {
                sales = liveSaleIds.Count,
                products = liveProductIds.Count,
                customers = await db.Customers.CountAsync(x => !x.IsDemo),
                expenses = await db.Expenses.CountAsync(x => !x.IsDemo)
            };
            await db.BillRevisions.Where(x => liveSaleIds.Contains(x.SaleId)).ExecuteDeleteAsync();
            await db.Payments.Where(x => liveSaleIds.Contains(x.SaleId)).ExecuteDeleteAsync();
            await db.SaleItems.Where(x => liveSaleIds.Contains(x.SaleId)).ExecuteDeleteAsync();
            await db.Sales.Where(x => !x.IsDemo).ExecuteDeleteAsync();
            await db.StockMovements.Where(x => liveProductIds.Contains(x.ProductId)).ExecuteDeleteAsync();
            await db.ProductImportLines.ExecuteDeleteAsync();
            await db.ProductImportBatches.ExecuteDeleteAsync();
            var liveExpenseIds=await db.Expenses.Where(x=>!x.IsDemo).Select(x=>x.Id).ToListAsync();
            await db.ExpensePayments.Where(x=>liveExpenseIds.Contains(x.ExpenseId)).ExecuteDeleteAsync();
            await db.Expenses.Where(x => !x.IsDemo).ExecuteDeleteAsync();
            await db.Customers.Where(x => !x.IsDemo).ExecuteDeleteAsync();
            await db.Products.Where(x => !x.IsDemo).ExecuteDeleteAsync();
            db.AuditEvents.Add(new AuditEvent { StaffId = Guid.TryParse(principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null, Actor = principal.Identity?.Name ?? "Owner", Action = "Purged", EntityType = "LiveData", Details = $"Owner purge after backup {backup.FileName}. Reason: {request.Reason?.Trim() ?? "Not supplied"}", DeviceId = "desktop" });
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(new { message = "Live records purged safely", backup, counts });
        });
    }

    static async Task<BackupResult> CreateBackup(AppDbContext db, IConfiguration configuration, string purpose)
    {
        if (db.Database.GetDbConnection() is not SqliteConnection source) throw new InvalidOperationException("Local backup and purge is available in Dukora Lite only.");
        var directory = BackupDirectory(configuration);
        Directory.CreateDirectory(directory);
        var fileName = $"dukora-manual-{purpose}-{DateTime.Now:yyyyMMdd-HHmmss}.db";
        var path = Path.Combine(directory, fileName);
        await source.OpenAsync();
        await using var destination = new SqliteConnection($"Data Source={path}");
        await destination.OpenAsync();
        source.BackupDatabase(destination);
        return new(fileName, path, DateTimeOffset.Now, new FileInfo(path).Length);
    }

    static string BackupDirectory(IConfiguration configuration)
    {
        var configured = configuration["Maintenance:BackupDirectory"];
        if (string.IsNullOrWhiteSpace(configured)) throw new InvalidOperationException("The local backup directory is not configured.");
        return Path.GetFullPath(configured);
    }

    sealed record PurgeRequest(string Confirmation, string? Reason);
    sealed record BackupResult(string FileName, string Path, DateTimeOffset CreatedAt, long SizeBytes);
}
