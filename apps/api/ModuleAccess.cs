using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public sealed class ModuleAccessFilter(string module) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var principal=context.HttpContext.User;
        var db=context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var organization=await db.Organizations.AsNoTracking().OrderBy(x=>x.Id).FirstOrDefaultAsync();
        if (organization is null) return Results.Json(new { error="Institution registration is incomplete." },statusCode:StatusCodes.Status409Conflict);
        var plan=PlanCatalog.Get(organization.PlanCode);
        var enabled=organization.EnabledModules.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
        if (!plan.Modules.Contains(module) || !enabled.Contains(module,StringComparer.OrdinalIgnoreCase))
            return Results.Json(new { error=$"The {module} module is not included in the {plan.Name} package or is disabled for this institution.",planCode=plan.Code,module },statusCode:StatusCodes.Status403Forbidden);
        return await next(context);
    }
}

public static class ModuleAccessExtensions
{
    public static RouteGroupBuilder RequireModule(this RouteGroupBuilder group,string module)=>group.AddEndpointFilterFactory((context,next)=>
        (ctx)=>new ModuleAccessFilter(module).InvokeAsync(ctx,next));
}
