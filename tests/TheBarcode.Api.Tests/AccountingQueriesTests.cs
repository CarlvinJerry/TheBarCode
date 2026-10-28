using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class AccountingQueriesTests
{
    [Fact]
    public async Task Trial_balance_groups_active_lines_and_excludes_superseded_history()
    {
        var path = Path.Combine(Path.GetTempPath(), $"thebarcode-ledger-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={path};Cache=Private").Options;
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            var cash = new LedgerAccount { Code = "1000", Name = "Cash", Type = "Asset" };
            var revenue = new LedgerAccount { Code = "4000", Name = "Revenue", Type = "Revenue" };
            var active = new JournalEntry { SourceType = "Sale", Memo = "New sale", Date = new DateOnly(2026, 1, 2) };
            active.Lines.Add(new JournalLine { AccountId = cash.Id, Description = "Cash", Debit = 100 });
            active.Lines.Add(new JournalLine { AccountId = revenue.Id, Description = "Revenue", Credit = 100 });
            var old = new JournalEntry { SourceType = "Sale", Memo = "Prior snapshot", Status = "Superseded", Date = new DateOnly(2026, 1, 1) };
            old.Lines.Add(new JournalLine { AccountId = cash.Id, Description = "Cash", Debit = 50 });
            old.Lines.Add(new JournalLine { AccountId = revenue.Id, Description = "Revenue", Credit = 50 });
            db.AddRange(cash, revenue, active, old);
            await db.SaveChangesAsync();

            var rows = await AccountingQueries.TrialBalance(db, false, new DateOnly(2026, 1, 3));
            var json = JsonSerializer.Serialize(rows);
            Assert.Contains("100", json);
            Assert.DoesNotContain("150", json);
            Assert.Equal(2, rows.Count);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var suffix in new[] { "", "-wal", "-shm" })
                if (File.Exists(path + suffix)) File.Delete(path + suffix);
        }
    }
}
