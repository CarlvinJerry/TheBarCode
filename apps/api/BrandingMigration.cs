using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class BrandingMigration
{
    public static async Task Apply(AppDbContext db)
    {
        var organization = await db.Organizations.OrderBy(x=>x.Id).FirstOrDefaultAsync();
        if (organization is null || organization.Name is not ("The BarCode" or "TheBarcode" or "Dukora")) return;

        organization.Name = "TheBarcode";
        if (string.IsNullOrWhiteSpace(organization.Tagline) || organization.Tagline is "Smart bar operations" or "Smart business operations")
            organization.Tagline = "Smarter Business Operations";
        organization.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }
}
