using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class BackgroundJobMigration
{
    public static async Task Apply(AppDbContext db)
    {
        var sql = db.Database.IsSqlite()
            ? new[] {
                "CREATE TABLE IF NOT EXISTS background_jobs (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL, completed_count INTEGER NOT NULL, total_count INTEGER NOT NULL, error TEXT NULL, payload_json TEXT NULL, result_json TEXT NULL, staff_id TEXT NOT NULL, actor TEXT NOT NULL, is_demo INTEGER NOT NULL, started_at TEXT NULL, finished_at TEXT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_background_jobs_status_created ON background_jobs(status, created_at)"
            }
            : new[] {
                "CREATE TABLE IF NOT EXISTS background_jobs (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, kind text NOT NULL, status text NOT NULL, stage text NOT NULL, completed_count integer NOT NULL, total_count integer NOT NULL, error text NULL, payload_json text NULL, result_json text NULL, staff_id uuid NOT NULL, actor text NOT NULL, is_demo boolean NOT NULL, started_at timestamptz NULL, finished_at timestamptz NULL)",
                "CREATE INDEX IF NOT EXISTS ix_background_jobs_status_created ON background_jobs(status, created_at)"
            };
        foreach (var statement in sql) await db.Database.ExecuteSqlRawAsync(statement);
    }
}
