using TheBarcode.Api;
using Xunit;

namespace TheBarcode.Api.Tests;

public sealed class SmartInsightsTests
{
    [Fact]
    public void Rules_flag_stock_margin_debt_and_expenses()
    {
        var snapshot = new OperationalSnapshot(
            new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31),
            100_000, 85_000, 15_000, 20_000, 20, 30_000, 4, 1, 50_000, 2_000,
            [], [], [], [], [], [], [], []);

        var ids = SmartInsightsService.RuleInsights(snapshot).Select(x => x.Id).ToList();

        Assert.Contains("stock-out", ids);
        Assert.Contains("low-stock", ids);
        Assert.Contains("margin", ids);
        Assert.Contains("debt", ids);
        Assert.Contains("expenses", ids);
    }

    [Fact]
    public void Rules_explain_empty_sales_range()
    {
        var snapshot = new OperationalSnapshot(
            new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31),
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            [], [], [], [], [], [], [], []);

        Assert.Contains(SmartInsightsService.RuleInsights(snapshot), x => x.Id == "no-sales");
    }
}
