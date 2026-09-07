using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class HealthEndpoints
{
    public static void MapHealthApi(this WebApplication app)
    {
        app.MapGet("/api/health/live", () => Results.Ok(new
        {
            status = "live",
            version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "development",
            time = DateTimeOffset.UtcNow
        }));

        app.MapGet("/api/health/ready", async (AppDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            try
            {
                if (!await db.Database.CanConnectAsync(cancellationToken))
                    return Results.Json(new { status = "not_ready", database = "unavailable", time = DateTimeOffset.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);

                return Results.Ok(new
                {
                    status = "ready",
                    database = "connected",
                    provider = configuration["Database:Provider"] ?? "Postgres",
                    version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "development",
                    time = DateTimeOffset.UtcNow
                });
            }
            catch
            {
                return Results.Json(new { status = "not_ready", database = "unavailable", time = DateTimeOffset.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        });
    }
}
