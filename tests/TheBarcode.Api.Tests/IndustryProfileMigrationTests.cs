using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class IndustryProfileMigrationTests
{
    [Fact]
    public async Task Existing_sqlite_organization_gets_industry_columns_idempotently()
    {
        await using var connection=new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using(var command=connection.CreateCommand())
        {
            command.CommandText="CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, industry_profile TEXT NOT NULL)";
            await command.ExecuteNonQueryAsync();
        }
        var options=new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db=new AppDbContext(options);

        await IndustryProfileMigration.Apply(db);
        await IndustryProfileMigration.Apply(db);

        await using var inspect=connection.CreateCommand();
        inspect.CommandText="PRAGMA table_info(organizations)";
        await using var rows=await inspect.ExecuteReaderAsync();
        var columns=new List<string>();
        while(await rows.ReadAsync())columns.Add(rows.GetString(1));
        Assert.Contains("business_category",columns);
        Assert.Contains("enabled_modules",columns);
        Assert.Contains("profile_configured",columns);
    }

    [Fact]
    public async Task SeedData_upgrades_legacy_organization_before_registration_queries_it()
    {
        await using var connection=new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var bootstrapOptions=new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using(var bootstrapDb=new AppDbContext(bootstrapOptions))
            await bootstrapDb.Database.EnsureCreatedAsync();
        await using(var command=connection.CreateCommand())
        {
            command.CommandText="PRAGMA foreign_keys=OFF; DROP TABLE organizations; CREATE TABLE organizations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, legal_name TEXT NULL, industry_profile TEXT NOT NULL, currency TEXT NOT NULL, phone TEXT NULL, email TEXT NULL, address TEXT NULL, tax_pin TEXT NULL, vat_number TEXT NULL, tagline TEXT NULL); PRAGMA foreign_keys=ON;";
            await command.ExecuteNonQueryAsync();
        }
        var options=new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using var db=new AppDbContext(options);

        await SeedData.Initialize(db,"123456");

        var organization=await db.Organizations.SingleAsync();
        Assert.Equal("OpenPreview",organization.PlanCode);
        Assert.Equal("BarCafe",organization.BusinessCategory);
    }
}
