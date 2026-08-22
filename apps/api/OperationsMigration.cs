using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class OperationsMigration
{
    public static async Task Apply(AppDbContext db)
    {
        var statements = db.Database.IsSqlite()
            ? new[]
            {
                "ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
                "ALTER TABLE sales ADD COLUMN due_at TEXT NULL",
                "ALTER TABLE sales ADD COLUMN posted_at TEXT NULL",
                "ALTER TABLE sales ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",
                "ALTER TABLE sales ADD COLUMN notes TEXT NULL",
                "CREATE TABLE IF NOT EXISTS bill_revisions (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sale_id TEXT NOT NULL, revision INTEGER NOT NULL, staff_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, snapshot_json TEXT NOT NULL, FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE)",
                "CREATE INDEX IF NOT EXISTS ix_bill_revisions_sale_id ON bill_revisions(sale_id)"
                ,"CREATE TABLE IF NOT EXISTS insights_configurations (id TEXT NOT NULL PRIMARY KEY, enabled INTEGER NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL, encrypted_api_key TEXT NULL, allow_user_names INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
            }
            : new[]
            {
                "ALTER TABLE customers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_at timestamptz NULL",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes text NULL",
                "CREATE TABLE IF NOT EXISTS bill_revisions (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE, revision integer NOT NULL, staff_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL, snapshot_json text NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_bill_revisions_sale_id ON bill_revisions(sale_id)"
                ,"CREATE TABLE IF NOT EXISTS insights_configurations (id uuid PRIMARY KEY, enabled boolean NOT NULL, endpoint text NOT NULL, model text NOT NULL, encrypted_api_key text NULL, allow_user_names boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)"
            };

        foreach (var statement in statements)
        {
            try { await db.Database.ExecuteSqlRawAsync(statement); }
            catch when (db.Database.IsSqlite() && statement.StartsWith("ALTER TABLE", StringComparison.Ordinal)) { }
        }
        if(!await db.InsightsConfigurations.AnyAsync()){db.InsightsConfigurations.Add(new InsightsConfiguration());await db.SaveChangesAsync();}
    }
}
