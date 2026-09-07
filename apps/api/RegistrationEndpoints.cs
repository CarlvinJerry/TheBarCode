using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class RegistrationEndpoints
{
    public static void MapRegistrationApi(this WebApplication app)
    {
        var api = app.MapGroup("/api/registration");
        api.MapGet("/catalog", () => Results.Ok(new { plans = PlanCatalog.All }));

        // Use a separate group so the public catalog does not inherit the
        // authorization convention applied to the owner-facing endpoints.
        var secured = app.MapGroup("/api/registration").RequireAuthorization();
        secured.MapGet("", async (AppDbContext db) =>
        {
            var organization = await db.Organizations.OrderBy(x => x.Id).FirstAsync();
            var plan = PlanCatalog.Get(organization.PlanCode);
            return Results.Ok(new
            {
                organization,
                plan,
                plans = PlanCatalog.All,
                enabledModules = organization.EnabledModules.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            });
        });

        secured.MapPut("", async (RegistrationRequest request, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!Security.HasRole(principal, "Owner")) return Results.Forbid();
            if (!PlanCatalog.IsKnown(request.PlanCode)) return Results.BadRequest(new { error = "Choose a valid package." });
            if (string.IsNullOrWhiteSpace(request.IndustryProfile) || string.IsNullOrWhiteSpace(request.BusinessCategory))
                return Results.BadRequest(new { error = "Industry and business category are required." });

            var plan = PlanCatalog.Get(request.PlanCode);
            var modules = PlanCatalog.NormalizeModules(request.PlanCode, request.EnabledModules);
            var organization = await db.Organizations.OrderBy(x => x.Id).FirstAsync();
            organization.PlanCode = plan.Code;
            organization.BillingStatus = string.IsNullOrWhiteSpace(request.BillingStatus) ? organization.BillingStatus : request.BillingStatus.Trim();
            organization.DeploymentMode = string.IsNullOrWhiteSpace(request.DeploymentMode) ? organization.DeploymentMode : request.DeploymentMode.Trim();
            organization.TrialEndsAt = request.TrialEndsAt;
            organization.BranchLimit = Math.Clamp(request.BranchLimit <= 0 ? plan.BranchLimit : request.BranchLimit, 1, plan.BranchLimit);
            organization.TerminalLimit = Math.Clamp(request.TerminalLimit <= 0 ? plan.TerminalLimit : request.TerminalLimit, 1, plan.TerminalLimit);
            organization.UserLimit = Math.Clamp(request.UserLimit <= 0 ? plan.UserLimit : request.UserLimit, 1, plan.UserLimit);
            organization.IndustryProfile = request.IndustryProfile.Trim();
            organization.BusinessCategory = request.BusinessCategory.Trim();
            organization.EnabledModules = string.Join(',', modules);
            organization.ProfileConfigured = true;
            organization.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent
            {
                StaffId = Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null,
                Actor = principal.Identity?.Name ?? "Owner",
                Action = "Updated",
                EntityType = "Registration",
                EntityId = organization.Id.ToString(),
                Details = $"Package {organization.PlanCode}; modules {organization.EnabledModules}; limits {organization.BranchLimit} branch(es), {organization.TerminalLimit} terminal(s), {organization.UserLimit} user(s)",
                DeviceId = "settings"
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { organization, plan, enabledModules = modules });
        });
    }
}
