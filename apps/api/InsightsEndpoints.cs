using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class InsightsEndpoints
{
    public static void MapOperationalApi(this WebApplication app)
    {
        var secured = app.MapGroup("/api").RequireAuthorization();

        secured.MapGet("/operations/overview", async (DateOnly? from, DateOnly? to, AppDbContext db,System.Security.Claims.ClaimsPrincipal principal) =>
        {
            var endDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var startDate = from ?? endDate.AddDays(-29);
            return Results.Ok(await BuildSnapshot(db, startDate, endDate,Security.IsDemo(principal)));
        });

        secured.MapGet("/expenses", async (DateOnly? from, DateOnly? to, string? category, AppDbContext db,System.Security.Claims.ClaimsPrincipal principal) =>
        {
            var demo=Security.IsDemo(principal);var query = db.Expenses.AsNoTracking().Where(x=>x.IsDemo==demo).AsQueryable();
            if (from is not null) query = query.Where(x => x.Date >= from);
            if (to is not null) query = query.Where(x => x.Date <= to);
            if (!string.IsNullOrWhiteSpace(category) && category != "All") query = query.Where(x => x.Category == category);
            return await query.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ToListAsync();
        });

        secured.MapGet("/insights", async (DateOnly? from, DateOnly? to, AppDbContext db, SmartInsightsService service,System.Security.Claims.ClaimsPrincipal principal,CancellationToken ct) =>
        {
            var endDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var startDate = from ?? endDate.AddDays(-29);
            var snapshot = await BuildSnapshot(db, startDate, endDate,Security.IsDemo(principal));
            return Results.Ok(await service.Generate(snapshot, ct));
        }).RequireAuthorization(p => p.RequireRole("Owner", "Manager", "Auditor"));
    }

    public static async Task<OperationalSnapshot> BuildSnapshot(AppDbContext db, DateOnly from, DateOnly to,bool demo=false)
    {
        if (to < from) (from, to) = (to, from);
        var start = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var financialSales=await db.Sales.AsNoTracking().Where(x=>x.IsDemo==demo&&(x.Status=="Paid"||x.Status=="Credit"||x.Status=="PartiallyPaid"||x.Status=="Refunded")).Include(x=>x.Items).Include(x=>x.Payments).ToListAsync();
        var allSales=financialSales.Where(x=>x.Status!="Refunded").ToList();
        var sales=allSales.Where(x=>x.OccurredAt>=start&&x.OccurredAt<end).ToList();
        var expenses = await db.Expenses.AsNoTracking().Where(x =>x.IsDemo==demo&&x.Date >= from && x.Date <= to).ToListAsync();
        var products = await db.Products.AsNoTracking().Where(x => x.Active&&x.IsDemo==demo).ToListAsync();
        var velocityStart=DateTimeOffset.UtcNow.AddDays(-30);var recentSales=allSales.Where(x=>(x.PostedAt??x.OccurredAt)>=velocityStart).ToList();var recentLines=recentSales.SelectMany(x=>x.Items).GroupBy(x=>x.ProductId).ToDictionary(x=>x.Key,x=>x.Sum(line=>line.Quantity)/30m);
        var customerSales=allSales.Where(x=>x.CustomerId!=null).ToList();
        var rangePayments=financialSales.SelectMany(x=>x.Payments).Where(x=>x.PaidAt>=start&&x.PaidAt<end).ToList();
        var activity=(await db.AuditEvents.AsNoTracking().Take(500).ToListAsync()).OrderByDescending(x=>x.OccurredAt).Take(12).ToList();
        var revenue = sales.Sum(x => x.Total);
        var salesCollected=sales.SelectMany(x=>x.Payments).Sum(x=>x.Amount);
        var collectionRate=revenue<=0?0:Math.Clamp(salesCollected/revenue*100m,0m,100m);
        var cashCollected=rangePayments.Sum(x=>x.Amount);
        var cost = sales.SelectMany(x => x.Items).Sum(x => x.UnitCost * x.Quantity);
        var paid = customerSales.SelectMany(x => x.Payments).Sum(x => x.Amount);
        var customerRevenue = customerSales.Sum(x => x.Total);
        var daily = sales.GroupBy(x => DateOnly.FromDateTime(x.OccurredAt.UtcDateTime)).Select(g => new DailyMetric(g.Key, g.Sum(x => x.Total), g.Sum(x => x.Total - x.Items.Sum(i => i.UnitCost * i.Quantity)))).OrderBy(x => x.Date).ToList();
        var top = sales.SelectMany(x => x.Items).GroupBy(x => new { x.ProductId, x.ProductName }).Select(g => new TopSeller(g.Key.ProductId, g.Key.ProductName, g.Sum(x => x.Quantity), g.Sum(x => x.Quantity * x.UnitPrice - x.Discount), g.Sum(x => (x.UnitPrice - x.UnitCost) * x.Quantity - x.Discount))).OrderByDescending(x => x.Revenue).Take(10).ToList();
        var categories = products.GroupBy(x => x.Category).Select(g => new CategoryStock(g.Key, g.Sum(x => x.Stock * x.CostPrice), g.Sum(x => x.Stock), g.Count())).OrderByDescending(x => x.Value).ToList();
        var expenseCategories = expenses.GroupBy(x => x.Category).Select(g => new NamedAmount(g.Key, g.Sum(x => x.Amount))).OrderByDescending(x => x.Amount).ToList();
        var paymentMix = rangePayments.GroupBy(x => x.Method).Select(g => new NamedAmount(g.Key, g.Sum(x => x.Amount))).OrderByDescending(x => x.Amount).ToList();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var stockRisks=products.Select(x=>{var dailyUse=recentLines.GetValueOrDefault(x.Id);var days=dailyUse>0?x.Stock/dailyUse:(decimal?)null;var projected=x.Stock<=x.MinStock*1.5m||(days is not null&&days<=7);return new StockRisk(x.Id,x.Name,x.Category,x.Stock,x.MinStock,x.CostPrice,x.SellingPrice,dailyUse,days,projected,x.Stock<=x.MinStock);}).Where(x=>x.ProjectedLow).OrderBy(x=>x.DaysRemaining??decimal.MaxValue).ThenBy(x=>x.Stock).ToList();
        return new OperationalSnapshot(from, to, revenue, cost, revenue - cost, expenses.Sum(x => x.Amount), sales.Count, Math.Max(0, customerRevenue - paid), stockRisks.Count, products.Count(x => x.Stock <= 0), products.Sum(x => x.Stock * x.CostPrice), sales.Where(x => DateOnly.FromDateTime(x.OccurredAt.UtcDateTime) == today).Sum(x => x.Total), daily, top, categories, expenseCategories, paymentMix, stockRisks, activity.Select(x => new ActivityItem(x.Actor, x.Action, x.EntityType, x.Details, x.DeviceId, x.OccurredAt)).ToList(), expenses.OrderByDescending(x => x.Date).Take(100).Select(x => new ExpenseItem(x.Id, x.Date, x.Description, x.Category, x.Amount, x.PaidAmount, x.Method)).ToList()){SalesCollected=salesCollected,CashCollected=cashCollected,CollectionRate=collectionRate};
    }
}

public sealed class SmartInsightsService(IConfiguration configuration, AppDbContext db, SecretProtector protector, IHttpClientFactory clients, ILogger<SmartInsightsService> logger)
{
    public async Task<object> Generate(OperationalSnapshot data, CancellationToken ct)
    {
        var rules = RuleInsights(data);
        var saved=await db.InsightsConfigurations.AsNoTracking().FirstOrDefaultAsync(ct);var apiKey=saved is {Enabled:true,EncryptedApiKey:not null}?protector.Unprotect(saved.EncryptedApiKey):configuration["Insights:ApiKey"];var endpoint=saved is {Enabled:true}?saved.Endpoint:configuration["Insights:Endpoint"];var model=saved is {Enabled:true}?saved.Model:configuration["Insights:Model"]??"configured-model";var allowUserNames=saved?.AllowUserNames==true;
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(endpoint))
            return Result("rules", false, "Rule engine active", data, rules);
        try
        {
            var client = clients.CreateClient("insights");
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = JsonContent.Create(new { model, messages = new[] { new { role = "system", content = "You are a business operations analyst. Return concise JSON with summary and insights. Never invent values. Never request or infer customer phone numbers or other contact details." }, new { role = "user", content = JsonSerializer.Serialize(new { aggregates = data.ForAi(allowUserNames), ruleFindings = rules }) } }, response_format = new { type = "json_object" }, temperature = 0.2 });
            using var response = await client.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var content = json.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
            using var generated = JsonDocument.Parse(content ?? "{}");
            var summary = generated.RootElement.TryGetProperty("summary", out var s) ? s.GetString() : null;
            return new { mode = "ai", providerConfigured = true, providerStatus = "AI analysis active", generatedAt = DateTimeOffset.UtcNow, range = new { data.From, data.To }, summary = summary ?? Summary(data), insights = rules, aiAnalysis = generated.RootElement.Clone() };
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Configured insight provider failed; falling back to rules");
            return Result("rules", true, "AI unavailable · rule engine fallback active", data, rules);
        }
    }

    static object Result(string mode, bool configured, string status, OperationalSnapshot data, List<SmartInsight> insights) => new { mode, providerConfigured = configured, providerStatus = status, generatedAt = DateTimeOffset.UtcNow, range = new { data.From, data.To }, summary = Summary(data), insights };
    static string Summary(OperationalSnapshot d) => $"{d.SalesCount} sales generated KES {d.Revenue:N0}; gross profit was KES {d.GrossProfit:N0}. {d.LowStockCount} items need stock attention and customer credit is KES {d.CustomerDebt:N0}.";
    public static List<SmartInsight> RuleInsights(OperationalSnapshot d)
    {
        var list = new List<SmartInsight>();
        var margin = d.Revenue == 0 ? 0 : d.GrossProfit / d.Revenue * 100;
        if (d.OutOfStockCount > 0) list.Add(new("stock-out", "Items are out of stock", $"{d.OutOfStockCount} active items have no stock.", "Inventory", "critical", $"{d.OutOfStockCount} items", "Restock best sellers first and confirm supplier lead times."));
        if (d.LowStockCount > 0) list.Add(new("low-stock", "Reorder stock", $"{d.LowStockCount} items are at or below their reorder level.", "Inventory", "warning", $"{d.LowStockCount} items", "Create a purchase list from the low-stock table."));
        if (d.Revenue > 0 && margin < 25) list.Add(new("margin", "Margin needs attention", $"Gross margin is {margin:N1}% for the selected period.", "Profit", margin < 15 ? "critical" : "warning", $"{margin:N1}%", "Review selling prices, discounts and supplier costs on high-volume items."));
        if (d.CustomerDebt > 0) list.Add(new("debt", "Follow up customer credit", $"Outstanding customer credit is KES {d.CustomerDebt:N0}.", "Customers", d.CustomerDebt > d.Revenue * .25m ? "critical" : "warning", $"KES {d.CustomerDebt:N0}", "Prioritize the largest balances and pause credit above configured limits."));
        if (d.Expenses > d.GrossProfit && d.Expenses > 0) list.Add(new("expenses", "Expenses exceed gross profit", "Operating expenses are higher than gross profit in this period.", "Expenses", "critical", $"KES {d.Expenses - d.GrossProfit:N0} gap", "Review the largest expense categories before the next shift close."));
        if (d.TopSellers.Count > 0) list.Add(new("top-seller", "Protect your best seller", $"{d.TopSellers[0].Name} leads sales at KES {d.TopSellers[0].Revenue:N0}.", "Sales", "positive", $"{d.TopSellers[0].Quantity:N0} units", "Keep it available and test a bundle or cross-sell with a high-margin item."));
        if (d.SalesCount == 0) list.Add(new("no-sales", "No sales in this range", "There are no recorded sales for the selected dates.", "Sales", "info", "0 sales", "Check the date range and confirm terminals have synchronized."));
        if (list.Count == 0) list.Add(new("healthy", "Operations look stable", "No high-priority exceptions were found in the selected period.", "Operations", "positive", "Stable", "Continue monitoring stock, margins, debt and expenses."));
        return list;
    }
}

public record OperationalSnapshot(DateOnly From, DateOnly To, decimal Revenue, decimal Cost, decimal GrossProfit, decimal Expenses, int SalesCount, decimal CustomerDebt, int LowStockCount, int OutOfStockCount, decimal StockValue, decimal TodayRevenue, List<DailyMetric> Daily, List<TopSeller> TopSellers, List<CategoryStock> StockByCategory, List<NamedAmount> ExpenseByCategory, List<NamedAmount> PaymentMix, List<StockRisk> LowStock, List<ActivityItem> Activity, List<ExpenseItem> ExpenseRecords)
{
    public decimal SalesCollected { get; init; }
    public decimal CashCollected { get; init; }
    public decimal CollectionRate { get; init; }
    public object ForAi(bool includeUserNames=false) => new { From, To, Revenue, Cost, GrossProfit, Expenses, SalesCount, SalesCollected, CashCollected, CollectionRate, CustomerDebt, LowStockCount, OutOfStockCount, StockValue, Daily, TopSellers, StockByCategory, ExpenseByCategory, PaymentMix,StaffActivity=includeUserNames?Activity.Select(x=>new{x.Actor,x.Action,x.EntityType,x.OccurredAt}):null };
}
public record DailyMetric(DateOnly Date, decimal Revenue, decimal Profit);
public record TopSeller(Guid ProductId, string Name, decimal Quantity, decimal Revenue, decimal Profit);
public record CategoryStock(string Name, decimal Value, decimal Quantity, int Items);
public record NamedAmount(string Name, decimal Amount);
public record StockRisk(Guid Id,string Name,string Category,decimal Stock,decimal MinStock,decimal CostPrice,decimal SellingPrice,decimal DailyUse,decimal? DaysRemaining,bool ProjectedLow,bool BelowMinimum);
public record ActivityItem(string Actor, string Action, string EntityType, string Details, string? DeviceId, DateTimeOffset OccurredAt);
public record ExpenseItem(Guid Id, DateOnly Date, string Description, string Category, decimal Amount, decimal PaidAmount, string Method);
public record SmartInsight(string Id, string Title, string Description, string Category, string Severity, string Metric, string Recommendation);
