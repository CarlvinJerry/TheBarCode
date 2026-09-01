using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public sealed class ModuleAccessFilter(string module) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var principal=context.HttpContext.User;
        if (Security.HasRole(principal,"Owner")) return await next(context);
        var db=context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
        var enabled=await db.Organizations.Select(x=>x.EnabledModules).FirstOrDefaultAsync() ?? "sales,inventory,expenses";
        if (!enabled.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Contains(module,StringComparer.OrdinalIgnoreCase))
            return Results.Json(new { error=$"The {module} module is not enabled for this institution." },statusCode:StatusCodes.Status403Forbidden);
        return await next(context);
    }
}

public static class ModuleAccessExtensions
{
    public static RouteGroupBuilder RequireModule(this RouteGroupBuilder group,string module)=>group.AddEndpointFilterFactory((context,next)=>
        (ctx)=>new ModuleAccessFilter(module).InvokeAsync(ctx,next));
}
