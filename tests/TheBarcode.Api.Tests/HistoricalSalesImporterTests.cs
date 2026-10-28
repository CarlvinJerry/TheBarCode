using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class HistoricalSalesImporterTests
{
    [Fact]
    public async Task Multiple_rows_get_unique_receipts_and_restart_does_not_double_post()
    {
        var path = Path.Combine(Path.GetTempPath(), $"thebarcode-import-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite($"Data Source={path};Cache=Private").Options;
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            var staff = new StaffUser { Name = "Owner", Role = "Owner", PinHash = "test" };
            var product = new Product { Name = "Cake", Category = "Bakery", Barcode = "CAKE", Stock = 10, CostPrice = 100 };
            var job = new BackgroundJob { Kind = "HistoricalSales", StaffId = staff.Id, Actor = staff.Name, TotalCount = 2 };
            db.AddRange(staff, product, job);
            await db.SaveChangesAsync();
            var request = new HistoricalSalesImportRequest("test", [
                new HistoricalSaleRow(2, new DateOnly(2026, 1, 1), "CAKE", null, 1, 200, "Cash", null),
                new HistoricalSaleRow(3, new DateOnly(2026, 1, 2), "CAKE", null, 2, 200, "Cash", null)
            ]);

            var prepared = 0;
            Assert.Equal(2, await HistoricalSalesImporter.RunJob(db, job, request, (done, _) => prepared = done, CancellationToken.None));
            Assert.Equal(2, prepared);
            Assert.Equal(2, await db.Sales.Select(x => x.ReceiptNumber).Distinct().CountAsync());
            Assert.Equal(7, (await db.Products.SingleAsync(x => x.Id == product.Id)).Stock);

            Assert.Equal(2, await HistoricalSalesImporter.RunJob(db, job, request, (_, _) => { }, CancellationToken.None));
            Assert.Equal(2, await db.Sales.CountAsync());
            Assert.Equal(7, (await db.Products.SingleAsync(x => x.Id == product.Id)).Stock);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var suffix in new[] { "", "-wal", "-shm" })
                if (File.Exists(path + suffix)) File.Delete(path + suffix);
        }
    }
}
