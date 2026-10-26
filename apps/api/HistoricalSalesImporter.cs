using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public sealed class HistoricalImportException(string message) : Exception(message);

public static class HistoricalSalesImporter
{
    public static async Task<int> RunJob(
        AppDbContext db, BackgroundJob job, HistoricalSalesImportRequest request,
        Action<int, int> progress, CancellationToken ct)
    {
        if (request.Rows is null || request.Rows.Count is < 1 or > 5000)
            throw new HistoricalImportException("Import between 1 and 5,000 historical sale rows.");
        if (request.Rows.Select(x => x.RowNumber).Distinct().Count() != request.Rows.Count)
            throw new HistoricalImportException("Historical CSV row numbers must be unique.");

        // A job may be restarted after a process shutdown between commit and the
        // final status write. Stable transaction IDs make that restart harmless.
        var prefix = $"historical-job-{job.Id:N}-";
        var existing = await db.Sales.AsNoTracking()
            .Where(x => x.DeviceTransactionId.StartsWith(prefix))
            .CountAsync(ct);
        if (existing == request.Rows.Count) return existing;
        if (existing != 0) throw new HistoricalImportException("This import has incomplete committed rows. Review the job before retrying.");

        var products = await db.Products.Where(x => x.IsDemo == job.IsDemo && x.Active).ToListAsync(ct);
        var byBarcode = products.Where(x => !string.IsNullOrWhiteSpace(x.Barcode))
            .GroupBy(x => x.Barcode!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);
        var byName = products.GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);
        var errors = new List<string>();
        var lines = new List<(HistoricalSaleRow Row, Product Product)>();
        foreach (var row in request.Rows)
        {
            if (row.Date == default) errors.Add($"Row {row.RowNumber}: date is required");
            if (row.Quantity <= 0 || row.Quantity != decimal.Truncate(row.Quantity)) errors.Add($"Row {row.RowNumber}: quantity must be a positive whole number");
            if (row.UnitPrice < 0) errors.Add($"Row {row.RowNumber}: unit price cannot be negative");
            Product? product = null;
            if (!string.IsNullOrWhiteSpace(row.Barcode)) byBarcode.TryGetValue(row.Barcode.Trim(), out product);
            if (product is null && !string.IsNullOrWhiteSpace(row.ProductName)) byName.TryGetValue(row.ProductName.Trim(), out product);
            if (product is null) errors.Add($"Row {row.RowNumber}: product was not found");
            else lines.Add((row, product));
        }
        if (errors.Count > 0) throw new HistoricalImportException(string.Join(" · ", errors.Take(20)));
        var shortage = lines.GroupBy(x => x.Product.Id).FirstOrDefault(g => g.Sum(x => x.Row.Quantity) > g.First().Product.Stock);
        if (shortage is not null) throw new HistoricalImportException($"{shortage.First().Product.Name} lacks confirmed stock for this import. Adjust opening stock first.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var nextReceipt = (await db.Sales.MaxAsync(x => (long?)x.ReceiptNumber, ct) ?? 1000) + 1;
        var prepared = 0;
        foreach (var (row, product) in lines)
        {
            ct.ThrowIfCancellationRequested();
            var sale = new Sale {
                DeviceTransactionId = $"{prefix}{row.RowNumber}", ReceiptNumber = nextReceipt++,
                StaffId = job.StaffId, Status = "Paid", IsDemo = job.IsDemo,
                OccurredAt = row.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                PostedAt = row.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                Notes = "Historical import"
            };
            sale.Items.Add(new SaleItem { ProductId = product.Id, ProductName = product.Name,
                Quantity = row.Quantity, UnitPrice = row.UnitPrice, UnitCost = product.CostPrice });
            sale.Total = row.Quantity * row.UnitPrice;
            sale.Payments.Add(new Payment { Method = string.IsNullOrWhiteSpace(row.PaymentMethod) ? "Cash" : row.PaymentMethod.Trim(),
                Amount = sale.Total, PaidAt = sale.OccurredAt });
            product.Stock -= row.Quantity;
            db.StockMovements.Add(new StockMovement { ProductId = product.Id, StaffId = job.StaffId,
                Type = "Historical sale import", QuantityChange = -row.Quantity,
                Notes = sale.DeviceTransactionId, OccurredAt = sale.OccurredAt });
            db.Sales.Add(sale);
            db.AuditEvents.Add(new AuditEvent { StaffId = job.StaffId, Actor = job.Actor,
                Action = "Imported", EntityType = "HistoricalSale", EntityId = sale.Id.ToString(),
                Details = $"{product.Name} · {row.Quantity} · {sale.Total} · {row.Date:yyyy-MM-dd}",
                DeviceId = request.DeviceId });
            progress(++prepared, lines.Count);
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return prepared;
    }
}
