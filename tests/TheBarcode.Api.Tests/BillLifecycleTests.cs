using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class BillLifecycleTests
{
    [Fact]
    public async Task Live_snapshot_excludes_held_cancelled_and_refunded_bills()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var staff = new StaffUser { Name = "Owner", Role = "Owner", PinHash = "test" };
        var product = new Product { Name = "Cake", Category = "Bakery", CostPrice = 200, SellingPrice = 500, Stock = 10 };
        db.AddRange(staff, product);
        foreach (var (status, number) in new[] { ("Paid", 1L), ("Held", 2L), ("Cancelled", 3L), ("Refunded", 4L) })
        {
            var sale = new Sale { DeviceTransactionId = $"test-{status}", ReceiptNumber = number, StaffId = staff.Id, Status = status, Total = 500, OccurredAt = DateTimeOffset.UtcNow };
            sale.Items.Add(new SaleItem { ProductId = product.Id, ProductName = product.Name, Quantity = 1, UnitPrice = 500, UnitCost = 200, Discount = 0 });
            db.Sales.Add(sale);
        }
        await db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await InsightsEndpoints.BuildSnapshot(db, today, today);

        Assert.Equal(1, result.SalesCount);
        Assert.Equal(500, result.Revenue);
        Assert.Equal(200, result.Cost);
        Assert.Equal(300, result.GrossProfit);
    }

    [Fact]
    public async Task Live_snapshot_projects_stock_risk_from_recent_posted_sales()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var staff = new StaffUser { Name = "Owner", Role = "Owner", PinHash = "test" };
        var product = new Product { Name = "Fast seller", Category = "Drinks", CostPrice = 40, SellingPrice = 100, Stock = 5, MinStock = 1 };
        var sale = new Sale { DeviceTransactionId = "velocity-test", ReceiptNumber = 1, StaffId = staff.Id, Status = "Paid", Total = 3000, OccurredAt = DateTimeOffset.UtcNow, PostedAt = DateTimeOffset.UtcNow };
        sale.Items.Add(new SaleItem { ProductId = product.Id, ProductName = product.Name, Quantity = 30, UnitPrice = 100, UnitCost = 40 });
        db.AddRange(staff, product, sale);
        await db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await InsightsEndpoints.BuildSnapshot(db, today.AddDays(-29), today);

        var risk = Assert.Single(result.LowStock);
        Assert.Equal(product.Id, risk.Id);
        Assert.Equal(1, risk.DailyUse);
        Assert.Equal(5, risk.DaysRemaining);
        Assert.False(risk.BelowMinimum);
        Assert.True(risk.ProjectedLow);
    }
}
