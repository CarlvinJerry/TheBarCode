using Microsoft.EntityFrameworkCore;
namespace TheBarcode.Api;
public static class SeedData
{
 public static async Task Initialize(AppDbContext db,string bootstrapPin){await db.Database.EnsureCreatedAsync();foreach(var statement in new[]{"ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false","ALTER TABLE products ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false","ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false","ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false"})await db.Database.ExecuteSqlRawAsync(statement);if(!await db.Staff.AnyAsync()){var admin=new StaffUser{Name="Admin",Role="Owner",PinHash=Security.HashPin(bootstrapPin)};db.Staff.Add(admin);db.AuditEvents.Add(new AuditEvent{StaffId=admin.Id,Actor=admin.Name,Action="Seeded",EntityType="System",Details="Created owner account",DeviceId="server"});await db.SaveChangesAsync();}await DemoData.Ensure(db);}
}
