using Microsoft.EntityFrameworkCore;
namespace TheBarcode.Api;
public static class IndustryProfileMigration
{
 public static async Task Apply(AppDbContext db)
 {
  if(!db.Database.IsSqlite()){foreach(var sql in new[]{"ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_category text NOT NULL DEFAULT 'BarCafe'","ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enabled_modules text NOT NULL DEFAULT 'sales,inventory,expenses,reports,ai,production'","ALTER TABLE organizations ADD COLUMN IF NOT EXISTS profile_configured boolean NOT NULL DEFAULT false","UPDATE organizations SET industry_profile='Hospitality' WHERE lower(industry_profile)='barcafe'"})await db.Database.ExecuteSqlRawAsync(sql);return;}
  var connection=db.Database.GetDbConnection();if(connection.State!=System.Data.ConnectionState.Open)await connection.OpenAsync();
  var existing=new HashSet<string>(StringComparer.OrdinalIgnoreCase);await using(var command=connection.CreateCommand()){command.CommandText="PRAGMA table_info(organizations)";await using var rows=await command.ExecuteReaderAsync();while(await rows.ReadAsync())existing.Add(rows.GetString(1));}
  var statements=new Dictionary<string,string>{{"business_category","ALTER TABLE organizations ADD COLUMN business_category TEXT NOT NULL DEFAULT 'BarCafe'"},{"enabled_modules","ALTER TABLE organizations ADD COLUMN enabled_modules TEXT NOT NULL DEFAULT 'sales,inventory,expenses,reports,ai,production'"},{"profile_configured","ALTER TABLE organizations ADD COLUMN profile_configured INTEGER NOT NULL DEFAULT 0"}};foreach(var (name,sql) in statements)if(!existing.Contains(name))await db.Database.ExecuteSqlRawAsync(sql);await db.Database.ExecuteSqlRawAsync("UPDATE organizations SET industry_profile='Hospitality' WHERE lower(industry_profile)='barcafe'");
 }
}
