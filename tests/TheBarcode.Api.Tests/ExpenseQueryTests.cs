using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class ExpenseQueryTests
{
    [Fact]
    public async Task Sqlite_expense_register_projects_then_orders_datetimeoffset_on_client()
    {
        await using var connection=new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options=new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db=new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var older=new Expense{Date=new DateOnly(2026,8,30),Category="Rent",Description="Older",Amount=100,PaidAmount=0,Method="Pending",Status="Approved"};
        var newer=new Expense{Date=new DateOnly(2026,8,31),Category="Utilities",Description="Newest",Amount=200,PaidAmount=0,Method="Pending",Status="PendingApproval"};
        db.Expenses.AddRange(older,newer);await db.SaveChangesAsync();

        var projected=await db.Expenses.AsNoTracking().Select(x=>new{x.Id,x.Date,x.Description,x.CreatedAt}).ToListAsync();
        var rows=projected.OrderByDescending(x=>x.Date).ThenByDescending(x=>x.CreatedAt).ToList();

        Assert.Equal(2,rows.Count);
        Assert.Equal("Newest",rows[0].Description);
    }
}
