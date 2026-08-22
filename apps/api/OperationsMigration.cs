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
                "ALTER TABLE products ADD COLUMN brand TEXT NULL",
                "ALTER TABLE products ADD COLUMN package_quantity TEXT NOT NULL DEFAULT 1",
                "ALTER TABLE products ADD COLUMN package_unit TEXT NOT NULL DEFAULT 'item'",
                "ALTER TABLE products ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'Discrete'",
                "ALTER TABLE products ADD COLUMN supplier TEXT NULL",
                "ALTER TABLE products ADD COLUMN tax_rate TEXT NOT NULL DEFAULT 0",
                "CREATE TABLE IF NOT EXISTS bill_revisions (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sale_id TEXT NOT NULL, revision INTEGER NOT NULL, staff_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, snapshot_json TEXT NOT NULL, FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE)",
                "CREATE INDEX IF NOT EXISTS ix_bill_revisions_sale_id ON bill_revisions(sale_id)"
                ,"CREATE TABLE IF NOT EXISTS insights_configurations (id TEXT NOT NULL PRIMARY KEY, enabled INTEGER NOT NULL, endpoint TEXT NOT NULL, model TEXT NOT NULL, encrypted_api_key TEXT NULL, allow_user_names INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                ,"CREATE TABLE IF NOT EXISTS product_import_batches (id TEXT NOT NULL PRIMARY KEY, staff_id TEXT NOT NULL, duplicate_policy TEXT NOT NULL, total_rows INTEGER NOT NULL, created_count INTEGER NOT NULL, updated_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL, status TEXT NOT NULL, device_id TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                ,"CREATE TABLE IF NOT EXISTS product_import_lines (id TEXT NOT NULL PRIMARY KEY, product_import_batch_id TEXT NOT NULL, product_id TEXT NOT NULL, product_was_created INTEGER NOT NULL, stock_change TEXT NOT NULL, previous_json TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (product_import_batch_id) REFERENCES product_import_batches(id) ON DELETE CASCADE)"
                ,"CREATE INDEX IF NOT EXISTS ix_product_import_lines_batch_id ON product_import_lines(product_import_batch_id)"
            }
            : new[]
            {
                "ALTER TABLE customers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_at timestamptz NULL",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1",
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes text NULL",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text NULL",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS package_quantity numeric(18,3) NOT NULL DEFAULT 1",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS package_unit text NOT NULL DEFAULT 'item'",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS tracking_mode text NOT NULL DEFAULT 'Discrete'",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier text NULL",
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate numeric(18,2) NOT NULL DEFAULT 0",
                "ALTER TABLE products ALTER COLUMN stock TYPE numeric(18,3)",
                "ALTER TABLE products ALTER COLUMN min_stock TYPE numeric(18,3)",
                "ALTER TABLE sale_items ALTER COLUMN quantity TYPE numeric(18,3)",
                "ALTER TABLE stock_movements ALTER COLUMN quantity_change TYPE numeric(18,3)",
                "CREATE TABLE IF NOT EXISTS bill_revisions (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE, revision integer NOT NULL, staff_id uuid NOT NULL, action text NOT NULL, reason text NOT NULL, snapshot_json text NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_bill_revisions_sale_id ON bill_revisions(sale_id)"
                ,"CREATE TABLE IF NOT EXISTS insights_configurations (id uuid PRIMARY KEY, enabled boolean NOT NULL, endpoint text NOT NULL, model text NOT NULL, encrypted_api_key text NULL, allow_user_names boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)"
                ,"CREATE TABLE IF NOT EXISTS product_import_batches (id uuid PRIMARY KEY, staff_id uuid NOT NULL, duplicate_policy text NOT NULL, total_rows integer NOT NULL, created_count integer NOT NULL, updated_count integer NOT NULL, skipped_count integer NOT NULL, status text NOT NULL, device_id text NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)"
                ,"CREATE TABLE IF NOT EXISTS product_import_lines (id uuid PRIMARY KEY, product_import_batch_id uuid NOT NULL REFERENCES product_import_batches(id) ON DELETE CASCADE, product_id uuid NOT NULL, product_was_created boolean NOT NULL, stock_change numeric(18,3) NOT NULL, previous_json text NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)"
                ,"CREATE INDEX IF NOT EXISTS ix_product_import_lines_batch_id ON product_import_lines(product_import_batch_id)"
            };

        foreach (var statement in statements)
        {
            try { await db.Database.ExecuteSqlRawAsync(statement); }
            catch when (db.Database.IsSqlite() && statement.StartsWith("ALTER TABLE", StringComparison.Ordinal)) { }
        }
        if(!await db.InsightsConfigurations.AnyAsync()){db.InsightsConfigurations.Add(new InsightsConfiguration());await db.SaveChangesAsync();}
    }
}
