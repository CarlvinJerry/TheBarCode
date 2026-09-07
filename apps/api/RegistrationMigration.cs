using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class RegistrationMigration
{
    public static async Task Apply(AppDbContext db)
    {
        var statements = new[]
            {
                "plan_code|ALTER TABLE organizations ADD COLUMN plan_code {0} NOT NULL DEFAULT 'OpenPreview'",
                "billing_status|ALTER TABLE organizations ADD COLUMN billing_status {0} NOT NULL DEFAULT 'Trial'",
                "trial_ends_at|ALTER TABLE organizations ADD COLUMN trial_ends_at {1} NULL",
                "deployment_mode|ALTER TABLE organizations ADD COLUMN deployment_mode {0} NOT NULL DEFAULT 'Local'",
                "branch_limit|ALTER TABLE organizations ADD COLUMN branch_limit {2} NOT NULL DEFAULT 99",
                "terminal_limit|ALTER TABLE organizations ADD COLUMN terminal_limit {2} NOT NULL DEFAULT 99",
                "user_limit|ALTER TABLE organizations ADD COLUMN user_limit {2} NOT NULL DEFAULT 99"
            };

        HashSet<string>? existing = null;
        if (db.Database.IsSqlite())
        {
            var connection = db.Database.GetDbConnection();
            if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
            existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA table_info(organizations)";
            await using var rows = await command.ExecuteReaderAsync();
            while (await rows.ReadAsync()) existing.Add(rows.GetString(1));
        }
        foreach (var definition in statements)
        {
            var parts = definition.Split('|', 2);
            if (existing is not null && existing.Contains(parts[0])) continue;
            var sql = db.Database.IsSqlite()
                ? string.Format(parts[1], "TEXT", "TEXT", "INTEGER")
                : $"ALTER TABLE organizations ADD COLUMN IF NOT EXISTS {parts[0]} " + (parts[0] == "trial_ends_at" ? "timestamptz" : parts[0].EndsWith("_limit", StringComparison.Ordinal) ? "integer" : "text") + (parts[0] == "trial_ends_at" ? " NULL" : $" NOT NULL DEFAULT {(parts[0] == "plan_code" ? "'OpenPreview'" : parts[0] == "billing_status" ? "'Trial'" : parts[0] == "deployment_mode" ? "'Local'" : "99")}");
            await db.Database.ExecuteSqlRawAsync(sql);
        }

        var organization = await db.Organizations.OrderBy(x => x.Id).FirstOrDefaultAsync();
        if (organization is null) return;

        if (!PlanCatalog.IsKnown(organization.PlanCode)) organization.PlanCode = PlanCatalog.OpenPreview;
        var plan = PlanCatalog.Get(organization.PlanCode);
        if (string.IsNullOrWhiteSpace(organization.EnabledModules)) organization.EnabledModules = string.Join(',', plan.Modules);
        if (organization.PlanCode.Equals(PlanCatalog.OpenPreview, StringComparison.OrdinalIgnoreCase))
            organization.EnabledModules = string.Join(',', PlanCatalog.NormalizeModules(PlanCatalog.OpenPreview, organization.EnabledModules.Split(',')));
        organization.BranchLimit = organization.BranchLimit <= 0 ? plan.BranchLimit : organization.BranchLimit;
        organization.TerminalLimit = organization.TerminalLimit <= 0 ? plan.TerminalLimit : organization.TerminalLimit;
        organization.UserLimit = organization.UserLimit <= 0 ? plan.UserLimit : organization.UserLimit;
        if (string.IsNullOrWhiteSpace(organization.BillingStatus)) organization.BillingStatus = "Trial";
        if (string.IsNullOrWhiteSpace(organization.DeploymentMode)) organization.DeploymentMode = "Local";
        organization.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }
}
