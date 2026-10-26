using System.Diagnostics;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace TheBarcode.Api;

public static class SystemLogs
{
    static readonly ConcurrentQueue<SlowRequest> SlowRequests = new();
    sealed record SlowRequest(string Method, string Path, long DurationMs, int StatusCode, DateTimeOffset At);
    public static async Task Apply(AppDbContext db)
    {
        var statements = db.Database.IsSqlite()
            ? new[] {
                "CREATE TABLE IF NOT EXISTS system_logs (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, occurred_at TEXT NOT NULL, level TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, actor TEXT NOT NULL, status_code INTEGER NOT NULL, duration_ms INTEGER NOT NULL, correlation_id TEXT NOT NULL, rows_affected INTEGER NULL, message TEXT NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_system_logs_occurred_at ON system_logs(occurred_at)"
            }
            : new[] {
                "CREATE TABLE IF NOT EXISTS system_logs (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, occurred_at timestamptz NOT NULL, level text NOT NULL, method text NOT NULL, path text NOT NULL, actor text NOT NULL, status_code integer NOT NULL, duration_ms bigint NOT NULL, correlation_id text NOT NULL, rows_affected integer NULL, message text NOT NULL)",
                "CREATE INDEX IF NOT EXISTS ix_system_logs_occurred_at ON system_logs(occurred_at DESC)"
            };
        foreach (var sql in statements) await db.Database.ExecuteSqlRawAsync(sql);
    }

    public static void MapSystemLogApi(this WebApplication app)
    {
        app.MapGet("/api/system-health", async (AppDbContext db, CancellationToken ct) =>
        {
            var connected = await db.Database.CanConnectAsync(ct);
            var connection = db.Database.GetDbConnection();
            var sqlite = db.Database.IsSqlite();
            long? databaseBytes = null;
            if (sqlite)
            {
                var dataSource = connection.DataSource;
                if (File.Exists(dataSource)) databaseBytes = new FileInfo(dataSource).Length;
            }
            return Results.Ok(new {
                database = connected ? "Connected" : "Unavailable",
                provider = sqlite ? "SQLite Lite" : db.Database.ProviderName,
                databaseBytes,
                slowRequests = SlowRequests.Reverse().Take(20).ToArray(),
                sampledAt = DateTimeOffset.UtcNow
            });
        }).RequireAuthorization(p => p.RequireRole("Owner", "Manager"));
        app.MapGet("/api/system-logs", async (int? take, string? level, AppDbContext db) =>
        {
            var rows = db.SystemLogs.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(level) && level != "All") rows = rows.Where(x => x.Level == level);
            return Results.Ok(await rows.OrderByDescending(x => x.OccurredAt).Take(Math.Clamp(take ?? 250, 1, 1000)).ToListAsync());
        }).RequireAuthorization(p => p.RequireRole("Owner", "Manager"));
    }

    public static async Task RecordRequest(HttpContext context, RequestDelegate next, IServiceScopeFactory scopes)
    {
        var path = context.Request.Path.Value ?? "";
        var shouldLog = path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWith("/api/system-logs", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWith("/api/health", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase);
        if (!shouldLog) { await next(context); return; }
        var watch = Stopwatch.StartNew();
        var failed = false;
        try { await next(context); }
        catch { failed = true; throw; }
        finally
        {
            watch.Stop();
            var status = failed && context.Response.StatusCode < 400 ? 500 : context.Response.StatusCode;
            if (context.Request.Method is "GET" or "HEAD" && watch.ElapsedMilliseconds >= 250)
            {
                SlowRequests.Enqueue(new SlowRequest(context.Request.Method, path, watch.ElapsedMilliseconds, status, DateTimeOffset.UtcNow));
                while (SlowRequests.Count > 100) SlowRequests.TryDequeue(out _);
            }
            if (!(context.Request.Method is "GET" or "HEAD" && status < 400)) try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var activity = Activity.Current?.TraceId.ToString();
                var affected = int.TryParse(context.Response.Headers["X-Records-Affected"], out var rows) ? rows
                    : context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE" && status < 400 ? 1 : (int?)null;
                db.SystemLogs.Add(new SystemLog {
                    Level = status >= 500 ? "Error" : status >= 400 ? "Warning" : "Info",
                    Method = context.Request.Method,
                    Path = path,
                    Actor = context.User.Identity?.Name ?? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "Anonymous",
                    StatusCode = status,
                    DurationMs = watch.ElapsedMilliseconds,
                    CorrelationId = activity ?? context.TraceIdentifier,
                    RowsAffected = affected,
                    Message = status >= 400 ? $"Request failed with HTTP {status}" : affected is int count ? $"Request completed; {count} record(s) affected" : "Request completed successfully"
                });
                await db.SaveChangesAsync();
            }
            catch (Exception ex) { context.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("SystemLogs").LogError(ex, "Could not persist system request log"); }
        }
    }
}
