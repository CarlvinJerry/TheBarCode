using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class ApiStartupValidationTests
{
    [Fact]
    public async Task All_api_routes_can_be_materialized_before_any_request_is_served()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite("Data Source=:memory:"));
        builder.Services.AddSingleton(new SecretProtector(new string('x', 48)));
        builder.Services.AddHttpClient("insights");
        builder.Services.AddScoped<SmartInsightsService>();
        builder.Services.AddSingleton<BackgroundJobs>();
        await using var app = builder.Build();

        const string jwt = "test-signing-key-that-is-long-enough-for-startup-validation";
        app.MapHealthApi();
        app.MapBarcodeApi(jwt);
        app.MapOperationalApi();
        app.MapBillApi();
        app.MapBulkProductApi();
        app.MapExpenseApi();
        app.MapMaintenanceApi();
        app.MapModularOperationsApi();
        app.MapIndustryProfileApi();
        app.MapRegistrationApi();
        app.MapBackgroundJobs();

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .ToList();

        Assert.NotEmpty(endpoints);
        Assert.Contains(endpoints, endpoint => endpoint is RouteEndpoint route
            && route.RoutePattern.RawText == "/api/products/{id:guid}");
    }
}
