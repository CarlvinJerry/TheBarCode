using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class LitePerformanceTests
{
    [Fact]
    public async Task Sqlite_resumes_pending_background_jobs_without_orderby_crashing_startup()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var first = new BackgroundJob { Kind = "Backup", Status = "Queued", CreatedAt = DateTimeOffset.Parse("2026-10-21T11:00:00+03:00") };
        var second = new BackgroundJob { Kind = "Backup", Status = "Running", CreatedAt = DateTimeOffset.Parse("2026-10-22T11:00:00+03:00") };
        db.BackgroundJobs.AddRange(second, first, new BackgroundJob { Kind = "Backup", Status = "Completed" });
        await db.SaveChangesAsync();

        Assert.Equal(new[] { first.Id, second.Id }, await BackgroundJobs.PendingJobIds(db));
    }

    [Fact]
    public async Task Sqlite_column_upgrade_skips_existing_column_and_preserves_rows()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db = new AppDbContext(options);
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE legacy_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
        await db.Database.ExecuteSqlRawAsync("INSERT INTO legacy_items (name) VALUES ('Client item')");

        const string addition = "ALTER TABLE legacy_items ADD COLUMN active INTEGER NOT NULL DEFAULT 1";
        Assert.True(await SqliteSchema.AddColumnIfMissing(db, addition));
        Assert.False(await SqliteSchema.AddColumnIfMissing(db, addition));
        Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM legacy_items WHERE name = 'Client item' AND active = 1").SingleAsync());
    }

    [Fact]
    public async Task Existing_lite_database_starts_with_new_job_table_and_keeps_business_rows()
    {
        var path = Path.Combine(Path.GetTempPath(), $"thebarcode-lite-upgrade-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite($"Data Source={path};Cache=Private;Default Timeout=10").Options;
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            db.Products.Add(new Product { Name = "Client stock", Category = "Test", Unit = "item", Stock = 7 });
            await db.SaveChangesAsync();
            // An earlier Lite file has no background-job table. Upgrade the same
            // file in place, then repeat startup to prove migrations are idempotent.
            await db.Database.ExecuteSqlRawAsync("DROP TABLE background_jobs");
            for (var start = 0; start < 2; start++)
            {
                await SeedData.Initialize(db, "123456");
                await OperationsMigration.Apply(db);
                await BrandingMigration.Apply(db);
                await ModularOperationsMigration.Apply(db);
                await LitePerformance.Apply(db, NullLogger.Instance);
            }
            var item = await db.Products.AsNoTracking().SingleAsync(x => x.Name == "Client stock");
            Assert.Equal(7, item.Stock);
            Assert.Equal(0, await db.BackgroundJobs.CountAsync());
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var suffix in new[] { "", "-wal", "-shm" })
                if (File.Exists(path + suffix)) File.Delete(path + suffix);
        }
    }

    [Fact]
    public async Task Existing_sqlite_rows_survive_wal_and_index_upgrade()
    {
        var path = Path.Combine(Path.GetTempPath(), $"thebarcode-performance-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite($"Data Source={path};Cache=Private;Default Timeout=10").Options;
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            db.Products.Add(new Product { Name = "Preserved item", Category = "Test", Unit = "item" });
            await db.SaveChangesAsync();

            await LitePerformance.Apply(db, NullLogger.Instance);
            await LitePerformance.Apply(db, NullLogger.Instance);

            await db.Database.OpenConnectionAsync();
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "PRAGMA journal_mode";
            Assert.Equal("wal", await command.ExecuteScalarAsync());
            await db.Database.CloseConnectionAsync();
            Assert.Equal(1, await db.Products.CountAsync(x => x.Name == "Preserved item"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM sqlite_master WHERE type='index' AND name='ix_sales_demo_status_occurred'").SingleAsync());
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var suffix in new[] { "", "-wal", "-shm" })
                if (File.Exists(path + suffix)) File.Delete(path + suffix);
        }
    }
}
