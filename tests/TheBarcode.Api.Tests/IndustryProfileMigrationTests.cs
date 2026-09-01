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
}
