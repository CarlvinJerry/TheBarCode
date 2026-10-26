using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public sealed class BackgroundJobs(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<BackgroundJobs> logger) : BackgroundService
{
    readonly Channel<Guid> queue = Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true });
    readonly ConcurrentDictionary<Guid, (int Completed, int Total, string Stage)> progress = new();

    public void Enqueue(Guid id) => queue.Writer.TryWrite(id);
    public object View(BackgroundJob job)
    {
        var current = progress.GetValueOrDefault(job.Id);
        return new { job.Id, job.Kind, job.Status,
            stage = current.Stage ?? job.Stage,
            completedCount = current.Total > 0 ? current.Completed : job.CompletedCount,
            totalCount = current.Total > 0 ? current.Total : job.TotalCount,
            job.Error, job.ResultJson, job.CreatedAt, job.StartedAt, job.FinishedAt };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await using (var scope = scopes.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var interrupted = await PendingJobIds(db, stoppingToken);
                foreach (var id in interrupted) Enqueue(id);
            }
            await foreach (var id in queue.Reader.ReadAllAsync(stoppingToken))
                await Run(id, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    public static async Task<IReadOnlyList<Guid>> PendingJobIds(AppDbContext db, CancellationToken ct = default)
    {
        // EF Core's SQLite provider cannot ORDER BY DateTimeOffset. Only the
        // small set of unfinished job headers is materialized; ordering then
        // happens in memory so startup works with both SQLite and PostgreSQL.
        var pending = await db.BackgroundJobs.AsNoTracking()
            .Where(x => x.Status == "Queued" || x.Status == "Running")
            .Select(x => new { x.Id, x.CreatedAt }).ToListAsync(ct);
        return pending.OrderBy(x => x.CreatedAt).Select(x => x.Id).ToList();
    }

    async Task Run(Guid id, CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var job = await db.BackgroundJobs.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (job is null || job.Status is not ("Queued" or "Running")) return;
            job.Status = "Running";
            job.Stage = "Validating";
            job.StartedAt ??= DateTimeOffset.UtcNow;
            job.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            progress[id] = (0, job.TotalCount, job.Stage);

            if (job.Kind == "HistoricalSales")
            {
                var request = JsonSerializer.Deserialize<HistoricalSalesImportRequest>(job.PayloadJson ?? "")
                    ?? throw new HistoricalImportException("The import data is missing.");
                progress[id] = (0, request.Rows.Count, "Preparing records");
                var count = await HistoricalSalesImporter.RunJob(db, job, request,
                    (completed, total) => progress[id] = (completed, total, "Preparing records"), ct);
                progress[id] = (count, count, "Committed");
                job.CompletedCount = count;
                job.ResultJson = JsonSerializer.Serialize(new { created = count });
            }
            else if (job.Kind == "Backup")
            {
                progress[id] = (0, 1, "Copying database");
                var backup = await MaintenanceEndpoints.CreateBackup(db, configuration, $"job-{id:N}");
                progress[id] = (1, 1, "Verified");
                job.CompletedCount = 1;
                job.ResultJson = JsonSerializer.Serialize(new { backup.FileName, backup.CreatedAt, backup.SizeBytes });
            }
            else throw new InvalidOperationException("Unknown background job type.");

            job.Status = "Completed";
            job.Stage = "Completed";
            job.PayloadJson = null;
            job.Error = null;
            job.FinishedAt = DateTimeOffset.UtcNow;
            job.UpdatedAt = job.FinishedAt.Value;
            db.AuditEvents.Add(new AuditEvent { StaffId = job.StaffId, Actor = job.Actor,
                Action = "Completed", EntityType = "BackgroundJob", EntityId = job.Id.ToString(),
                Details = $"{job.Kind}: {job.CompletedCount} record(s) prepared and committed", DeviceId = "local-server" });
            await db.SaveChangesAsync(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception error)
        {
            logger.LogError(error, "Background job {JobId} failed", id);
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var job = await db.BackgroundJobs.SingleOrDefaultAsync(x => x.Id == id);
            if (job is not null)
            {
                job.Status = "Failed";
                job.Stage = "Needs attention";
                job.Error = error is HistoricalImportException ? error.Message : "The job failed. Review System logs, then retry this job.";
                job.FinishedAt = DateTimeOffset.UtcNow;
                job.UpdatedAt = job.FinishedAt.Value;
                db.SystemLogs.Add(new SystemLog { Level = "Error", Method = "JOB", Path = job.Kind,
                    Actor = job.Actor, StatusCode = 500, DurationMs = 0, CorrelationId = id.ToString(),
                    Message = error.Message });
                await db.SaveChangesAsync();
            }
        }
        finally { progress.TryRemove(id, out _); }
    }
}

public static class BackgroundJobEndpoints
{
    public static void MapBackgroundJobs(this WebApplication app)
    {
        var api = app.MapGroup("/api/background-jobs").RequireAuthorization(p => p.RequireRole("Owner", "Manager"));
        api.MapPost("/historical-sales", async (HistoricalSalesImportRequest request, AppDbContext db,
            ClaimsPrincipal principal, BackgroundJobs worker) =>
        {
            if (request.Rows is null || request.Rows.Count is < 1 or > 5000)
                return Results.BadRequest(new { error = "Import between 1 and 5,000 historical sale rows." });
            var job = NewJob("HistoricalSales", principal, request.Rows.Count, JsonSerializer.Serialize(request));
            db.BackgroundJobs.Add(job);
            await db.SaveChangesAsync();
            worker.Enqueue(job.Id);
            return Results.Accepted($"/api/background-jobs/{job.Id}", worker.View(job));
        });
        api.MapPost("/backup", async (AppDbContext db, ClaimsPrincipal principal, BackgroundJobs worker) =>
        {
            var job = NewJob("Backup", principal, 1, null);
            db.BackgroundJobs.Add(job);
            await db.SaveChangesAsync();
            worker.Enqueue(job.Id);
            return Results.Accepted($"/api/background-jobs/{job.Id}", worker.View(job));
        }).RequireAuthorization(p => p.RequireRole("Owner"));
        api.MapGet("/{id:guid}", async (Guid id, AppDbContext db, ClaimsPrincipal principal, BackgroundJobs worker) =>
        {
            var job = await db.BackgroundJobs.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.IsDemo == Security.IsDemo(principal));
            if (job is null || job.Kind == "Backup" && !principal.IsInRole("Owner")) return Results.NotFound();
            return Results.Ok(worker.View(job));
        });
        api.MapPost("/{id:guid}/retry", async (Guid id, AppDbContext db, ClaimsPrincipal principal, BackgroundJobs worker) =>
        {
            var job = await db.BackgroundJobs.SingleOrDefaultAsync(x => x.Id == id && x.IsDemo == Security.IsDemo(principal));
            if (job is null || job.Kind == "Backup" && !principal.IsInRole("Owner")) return Results.NotFound();
            if (job.Status != "Failed" || string.IsNullOrEmpty(job.PayloadJson) && job.Kind == "HistoricalSales")
                return Results.Conflict(new { error = "Only failed jobs with recoverable input can be retried." });
            job.Status = "Queued"; job.Stage = "Waiting"; job.Error = null;
            job.CompletedCount = 0; job.FinishedAt = null; job.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            worker.Enqueue(id);
            return Results.Accepted($"/api/background-jobs/{id}", worker.View(job));
        });
        api.MapPost("/{id:guid}/cancel", async (Guid id, AppDbContext db, ClaimsPrincipal principal) =>
        {
            var job = await db.BackgroundJobs.SingleOrDefaultAsync(x => x.Id == id && x.IsDemo == Security.IsDemo(principal));
            if (job is null || job.Kind == "Backup" && !principal.IsInRole("Owner")) return Results.NotFound();
            if (job.Status != "Queued") return Results.Conflict(new { error = "A running job cannot be cancelled safely. Wait for it to finish." });
            job.Status = "Cancelled"; job.Stage = "Cancelled"; job.PayloadJson = null;
            job.FinishedAt = DateTimeOffset.UtcNow; job.UpdatedAt = job.FinishedAt.Value;
            await db.SaveChangesAsync();
            return Results.Ok(new { job.Id, job.Status });
        });
    }

    static BackgroundJob NewJob(string kind, ClaimsPrincipal principal, int count, string? payload)
        => new() { Kind = kind, TotalCount = count, PayloadJson = payload,
            StaffId = Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : Guid.Empty,
            Actor = principal.Identity?.Name ?? "Staff", IsDemo = Security.IsDemo(principal) };
}
