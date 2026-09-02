using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class AdvancedInventoryMigration
{
    public static async Task Apply(AppDbContext db)
    {
        var statements = db.Database.IsSqlite()
            ? new[]
            {
                "CREATE TABLE IF NOT EXISTS suppliers (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NULL, email TEXT NULL, tax_number TEXT NULL, active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0)",
                "CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, number TEXT NOT NULL, supplier_id TEXT NOT NULL, staff_id TEXT NOT NULL, branch_id TEXT NULL, status TEXT NOT NULL, ordered_date TEXT NOT NULL, expected_date TEXT NULL, notes TEXT NULL, total TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)",
                "CREATE TABLE IF NOT EXISTS purchase_order_lines (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, product_id TEXT NOT NULL, quantity_ordered TEXT NOT NULL, quantity_received TEXT NOT NULL, unit_cost TEXT NOT NULL, line_total TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_purchase_order_lines_order_id ON purchase_order_lines(purchase_order_id)",
                "CREATE TABLE IF NOT EXISTS stock_lots (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, product_id TEXT NOT NULL, supplier_id TEXT NULL, lot_number TEXT NOT NULL, expiry_date TEXT NULL, quantity TEXT NOT NULL, unit_cost TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)",
                "CREATE INDEX IF NOT EXISTS ix_stock_lots_product_id ON stock_lots(product_id)",
                "CREATE TABLE IF NOT EXISTS stocktake_sessions (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, staff_id TEXT NOT NULL, status TEXT NOT NULL, count_date TEXT NOT NULL, submitted_at TEXT NULL, approved_at TEXT NULL, is_demo INTEGER NOT NULL DEFAULT 0)",
                "CREATE TABLE IF NOT EXISTS stocktake_lines (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, stocktake_session_id TEXT NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE, product_id TEXT NOT NULL, expected_quantity TEXT NOT NULL, counted_quantity TEXT NOT NULL, variance TEXT NOT NULL, lot_number TEXT NULL, expiry_date TEXT NULL, notes TEXT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_stocktake_lines_session_id ON stocktake_lines(stocktake_session_id)"
            }
            : new[]
            {
                "CREATE TABLE IF NOT EXISTS suppliers (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, name text NOT NULL, phone text NULL, email text NULL, tax_number text NULL, active boolean NOT NULL DEFAULT true, is_demo boolean NOT NULL DEFAULT false)",
                "CREATE TABLE IF NOT EXISTS purchase_orders (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, number text NOT NULL, supplier_id uuid NOT NULL, staff_id uuid NOT NULL, branch_id uuid NULL, status text NOT NULL, ordered_date date NOT NULL, expected_date date NULL, notes text NULL, total numeric(18,2) NOT NULL, is_demo boolean NOT NULL DEFAULT false)",
                "CREATE TABLE IF NOT EXISTS purchase_order_lines (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, product_id uuid NOT NULL, quantity_ordered numeric(18,3) NOT NULL, quantity_received numeric(18,3) NOT NULL, unit_cost numeric(18,2) NOT NULL, line_total numeric(18,2) NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_purchase_order_lines_order_id ON purchase_order_lines(purchase_order_id)",
                "CREATE TABLE IF NOT EXISTS stock_lots (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, product_id uuid NOT NULL, supplier_id uuid NULL, lot_number text NOT NULL, expiry_date date NULL, quantity numeric(18,3) NOT NULL, unit_cost numeric(18,2) NOT NULL, is_demo boolean NOT NULL DEFAULT false)",
                "CREATE INDEX IF NOT EXISTS ix_stock_lots_product_id ON stock_lots(product_id)",
                "CREATE TABLE IF NOT EXISTS stocktake_sessions (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, name text NOT NULL, staff_id uuid NOT NULL, status text NOT NULL, count_date date NOT NULL, submitted_at timestamptz NULL, approved_at timestamptz NULL, is_demo boolean NOT NULL DEFAULT false)",
                "CREATE TABLE IF NOT EXISTS stocktake_lines (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, stocktake_session_id uuid NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE, product_id uuid NOT NULL, expected_quantity numeric(18,3) NOT NULL, counted_quantity numeric(18,3) NOT NULL, variance numeric(18,3) NOT NULL, lot_number text NULL, expiry_date date NULL, notes text NULL)",
                "CREATE INDEX IF NOT EXISTS ix_stocktake_lines_session_id ON stocktake_lines(stocktake_session_id)"
            };
        foreach (var statement in statements) await db.Database.ExecuteSqlRawAsync(statement);
    }
}
