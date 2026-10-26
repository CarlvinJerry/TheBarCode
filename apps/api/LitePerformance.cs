using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class LitePerformance
{
    // Non-destructive, idempotent upgrades. Existing client rows are never rewritten.
    public static async Task Apply(AppDbContext db, ILogger logger)
    {
        if (!db.Database.IsSqlite()) return;
        try { await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL"); }
        catch (Exception error) { logger.LogWarning(error, "SQLite WAL mode could not be enabled; database remains usable"); }
        foreach (var sql in new[]
        {
            "CREATE INDEX IF NOT EXISTS ix_sales_demo_status_occurred ON sales(is_demo, status, occurred_at)",
            "CREATE INDEX IF NOT EXISTS ix_sales_demo_updated ON sales(is_demo, updated_at)",
            "CREATE INDEX IF NOT EXISTS ix_expenses_demo_status_date ON expenses(is_demo, status, date)",
            "CREATE INDEX IF NOT EXISTS ix_stock_movements_product_occurred ON stock_movements(product_id, occurred_at)",
            "CREATE INDEX IF NOT EXISTS ix_payments_sale_paid ON payments(sale_id, paid_at)",
            "CREATE INDEX IF NOT EXISTS ix_products_demo_name ON products(is_demo, name)",
            "CREATE INDEX IF NOT EXISTS ix_customers_demo_name ON customers(is_demo, name)",
            "CREATE INDEX IF NOT EXISTS ix_audit_events_staff_occurred ON audit_events(staff_id, occurred_at)"
        }) try { await db.Database.ExecuteSqlRawAsync(sql); }
        catch (Exception error)
        {
            // An optimization must never stop a business from opening.
            logger.LogWarning(error, "SQLite performance index was skipped: {Statement}", sql);
        }
    }
}
