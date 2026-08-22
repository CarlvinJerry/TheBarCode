using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class HeldBillPersistenceTests
{
    [Fact]
    public async Task Replacing_held_bill_lines_persists_new_items()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var staff = new StaffUser { Name = "Cashier", Role = "Cashier", PinHash = "test" };
        var first = new Product { Name = "Coffee", Category = "Food", Unit = "cup", CostPrice = 50, SellingPrice = 100, Stock = 10 };
        var added = new Product { Name = "Cake", Category = "Food", Unit = "slice", CostPrice = 80, SellingPrice = 150, Stock = 8 };
        var sale = new Sale { DeviceTransactionId = Guid.NewGuid().ToString(), ReceiptNumber = 1, DailyOrderNumber = 1, StaffId = staff.Id, Status = "Held", Total = 100 };
        sale.Items.Add(new SaleItem { ProductId = first.Id, ProductName = first.Name, Quantity = 1, UnitPrice = 100, UnitCost = 50 });
        db.AddRange(staff, first, added, sale);
        await db.SaveChangesAsync();

        var oldItems = sale.Items.ToList();
        await db.SaleItems.Where(x => x.SaleId == sale.Id).ExecuteDeleteAsync();
        foreach (var oldItem in oldItems) db.Entry(oldItem).State = EntityState.Detached;
        sale.Items.Clear();
        sale.Items.Add(new SaleItem { SaleId = sale.Id, ProductId = first.Id, ProductName = first.Name, Quantity = 2, UnitPrice = 100, UnitCost = 50 });
        sale.Items.Add(new SaleItem { SaleId = sale.Id, ProductId = added.Id, ProductName = added.Name, Quantity = 1, UnitPrice = 150, UnitCost = 80 });
        db.SaleItems.AddRange(sale.Items);
        sale.Total = 350;
        sale.Revision++;
        await db.SaveChangesAsync();

        db.ChangeTracker.Clear();
        var persisted = await db.Sales.Include(x => x.Items).SingleAsync(x => x.Id == sale.Id);
        Assert.Equal(2, persisted.Items.Count);
        Assert.Equal(350, persisted.Total);
        Assert.Contains(persisted.Items, x => x.ProductId == added.Id);
    }
}
