using TheBarcode.Api;

namespace TheBarcode.Api.Tests;

public sealed class StockMovementRulesTests
{
    static Product Product(decimal stock = 5, string mode = "Discrete", decimal cost = 10) =>
        new() { Name = "Soda", Category = "Drinks", Unit = "bottle", Stock = stock, TrackingMode = mode, CostPrice = cost };

    static StockRequest Movement(Product product, string type, decimal change, bool financials = false, decimal? unitCost = null) =>
        new(Guid.NewGuid(), product.Id, Guid.NewGuid(), type, change, "Count correction", "test", financials, unitCost);

    [Theory]
    [InlineData(3)]
    [InlineData(-3)]
    public void Adjustment_can_increase_or_decrease_stock(decimal change)
    {
        var product = Product();
        Assert.Null(StockMovementRules.Validate(Movement(product, "Adjustment", change), product));
    }

    [Fact]
    public void Decrease_beyond_available_stock_is_rejected_instead_of_clamped()
    {
        var product = Product();
        var result = StockMovementRules.Validate(Movement(product, "Adjustment", -6), product);
        Assert.Equal(409, result?.StatusCode);
        Assert.Contains("5 available", result!.Error);
    }

    [Fact]
    public void Financial_restock_requires_the_selected_items_cost()
    {
        var product = Product(cost: 0);
        Assert.Equal(400, StockMovementRules.Validate(Movement(product, "Restock", 2, financials: true, unitCost: 0), product)?.StatusCode);
        Assert.Null(StockMovementRules.Validate(Movement(product, "Restock", 2, financials: true, unitCost: 52), product));
    }

    [Theory]
    [InlineData("Restock", -1)]
    [InlineData("Wastage", 1)]
    [InlineData("Transfer out", 1)]
    public void Movement_type_cannot_reverse_its_expected_direction(string type, decimal change)
    {
        var product = Product();
        Assert.Equal(400, StockMovementRules.Validate(Movement(product, type, change), product)?.StatusCode);
    }

    [Fact]
    public void Measured_item_accepts_fractional_adjustments_but_discrete_item_does_not()
    {
        var measured = Product(mode: "Measured");
        var discrete = Product();
        Assert.Null(StockMovementRules.Validate(Movement(measured, "Adjustment", -0.5m), measured));
        Assert.Equal(400, StockMovementRules.Validate(Movement(discrete, "Adjustment", -0.5m), discrete)?.StatusCode);
    }
}
