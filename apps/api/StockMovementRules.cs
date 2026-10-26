namespace TheBarcode.Api;

public sealed record StockMovementValidation(int StatusCode, string Error);

public static class StockMovementRules
{
    public static StockMovementValidation? Validate(StockRequest request, Product product)
    {
        if (request.QuantityChange == 0)
            return new(400, "Enter a non-zero quantity change.");
        if (!new[] { "Restock", "Adjustment", "Wastage", "Transfer out" }.Contains(request.Type, StringComparer.OrdinalIgnoreCase))
            return new(400, "Choose a valid stock movement type.");
        if (string.Equals(request.Type, "Restock", StringComparison.OrdinalIgnoreCase) && request.QuantityChange < 0)
            return new(400, "Restocks must increase stock. Use a decrease adjustment for corrections.");
        if ((string.Equals(request.Type, "Wastage", StringComparison.OrdinalIgnoreCase) || string.Equals(request.Type, "Transfer out", StringComparison.OrdinalIgnoreCase)) && request.QuantityChange > 0)
            return new(400, "Wastage and transfers out must decrease stock.");
        if (string.Equals(product.TrackingMode, "Discrete", StringComparison.OrdinalIgnoreCase) && request.QuantityChange != decimal.Truncate(request.QuantityChange))
            return new(400, "Discrete stock movements must use whole quantities.");
        if (product.Stock + request.QuantityChange < 0)
            return new(409, $"{product.Name} has {product.Stock:0.###} available in the local database. A decrease of {Math.Abs(request.QuantityChange):0.###} would make stock negative. Refresh inventory and try again.");
        if (string.Equals(request.Type, "Restock", StringComparison.OrdinalIgnoreCase) && request.AffectsFinancials && (request.UnitCost ?? product.CostPrice) <= 0)
            return new(400, "A positive unit cost is required for a financially tracked restock.");
        return null;
    }
}
