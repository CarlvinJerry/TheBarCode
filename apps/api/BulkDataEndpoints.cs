using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class BulkDataEndpoints
{
    static readonly string[] Tables = ["items", "customers", "sales", "expenses", "stock-movements", "suppliers", "purchase-orders", "production-runs", "recipes", "stocktakes", "accounting-journals"];

    public static void MapBulkDataApi(this WebApplication app)
    {
        var group = app.MapGroup("/api/bulk-data").RequireAuthorization().RequireAuthorization(p => p.RequireRole("Owner", "Manager"));
        group.MapGet("/tables", () => Results.Ok(new { tables = Tables, importable = new[] { "items", "customers", "expenses", "historical-sales" }, note = "Operational records only. Staff credentials, PIN hashes, security settings and audit logs are excluded." }));
        group.MapGet("/export/{table}", Export);
        group.MapPost("/import/customers", ImportCustomers);
        group.MapPost("/import/expenses", ImportExpenses);
    }

    static async Task<IResult> Export(string table, AppDbContext db, ClaimsPrincipal principal, HttpContext context)
    {
        var key = table.Trim().ToLowerInvariant();
        if (key != "all" && !Tables.Contains(key)) return Results.BadRequest(new { error = "Choose a supported operational table." });
        var demo = Security.IsDemo(principal);
        var data = key == "all"
            ? await BuildAll(db, demo)
            : new Dictionary<string, object[]> { [key] = await BuildTable(db, demo, key) };
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
        var json = JsonSerializer.SerializeToUtf8Bytes(new { product = "TheBarcode Lite", formatVersion = 1, exportedAt = DateTimeOffset.UtcNow, mode = demo ? "demo" : "live", tables = data }, options);
        db.AuditEvents.Add(new AuditEvent { StaffId = StaffId(principal), Actor = principal.Identity?.Name ?? "Staff", Action = "Exported", EntityType = "BulkData", Details = key == "all" ? $"Exported operational data bundle · {Tables.Length} tables" : $"Exported {key} · {data[key].Length} records", DeviceId = context.Request.Headers["X-Device-Id"].FirstOrDefault() });
        await db.SaveChangesAsync();
        context.Response.Headers["X-Records-Affected"] = data.Values.Sum(x => x.Length).ToString();
        if (key == "all") return Results.File(json, "application/json; charset=utf-8", $"TheBarcode-operational-data-{DateTime.Now:yyyyMMdd-HHmm}.json");
        var csv = ToCsv(data[key], options);
        return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv; charset=utf-8", $"TheBarcode-{key}-{DateTime.Now:yyyyMMdd-HHmm}.csv");
    }

    static async Task<Dictionary<string, object[]>> BuildAll(AppDbContext db, bool demo)
    {
        var result = new Dictionary<string, object[]>();
        foreach (var table in Tables) result[table] = await BuildTable(db, demo, table);
        return result;
    }

    static async Task<object[]> BuildTable(AppDbContext db, bool demo, string table) => table switch
    {
        "items" => (await db.Products.AsNoTracking().Where(x => x.IsDemo == demo).OrderBy(x => x.Name).ToListAsync()).Select(x => (object)new { name = x.Name, category = x.Category, item_type = x.ItemType, brand = x.Brand, barcode_sku = x.Barcode, stock_unit = x.Unit, package_quantity = x.PackageQuantity, package_unit = x.PackageUnit, tracking_mode = x.TrackingMode, cost_price = x.CostPrice, selling_price = x.SellingPrice, opening_stock = x.Stock, minimum_stock = x.MinStock, supplier = x.Supplier, tax_rate = x.TaxRate, sellable = x.Sellable, active = x.Active }).ToArray(),
        "customers" => (await db.Customers.AsNoTracking().Where(x => x.IsDemo == demo).OrderBy(x => x.Name).ToListAsync()).Select(x => (object)new { id = x.Id, name = x.Name, phone = x.Phone, credit_limit = x.CreditLimit, notes = x.Notes, active = x.Active }).ToArray(),
        "sales" => (await db.Sales.AsNoTracking().Include(x => x.Items).Include(x => x.Payments).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.OccurredAt).ToListAsync()).Select(x => (object)new { x.Id, x.DeviceTransactionId, x.ReceiptNumber, x.DailyOrderNumber, x.WalkInNumber, x.CustomerId, x.StaffId, x.Status, x.Discount, x.Total, x.OccurredAt, x.DueAt, x.ExpectedDeliveryAt, x.FulfillmentStatus, x.PostedAt, x.Notes, Items = x.Items.Select(i => new { i.ProductId, i.ProductName, i.Quantity, i.UnitPrice, i.UnitCost, i.Discount, i.IsAddon }), Payments = x.Payments.Select(p => new { p.Method, p.Amount, p.PaidAt }) }).ToArray(),
        "expenses" => (await db.Expenses.AsNoTracking().Include(x => x.Payments).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.Date).ToListAsync()).Select(x => (object)new { x.Id, x.Date, x.Category, x.Description, x.Amount, x.PaidAmount, x.Method, x.Payee, x.Reference, x.DueDate, x.TaxAmount, x.Notes, x.Type, x.Status, x.Active, Payments = x.Payments.Select(p => new { p.Amount, p.Method, p.Reference, p.PaidAt }) }).ToArray(),
        "stock-movements" => (await db.StockMovements.AsNoTracking().Join(db.Products.AsNoTracking().Where(p => p.IsDemo == demo), m => m.ProductId, p => p.Id, (m, p) => new { Movement = m, Product = p }).OrderBy(x => x.Movement.OccurredAt).ToListAsync()).Select(x => (object)new { x.Movement.Id, x.Movement.ProductId, productName = x.Product.Name, x.Movement.StaffId, x.Movement.Type, x.Movement.QuantityChange, x.Movement.Notes, x.Movement.AffectsFinancials, x.Movement.UnitCost, x.Movement.OccurredAt }).ToArray(),
        "suppliers" => (await db.Suppliers.AsNoTracking().Where(x => x.IsDemo == demo).OrderBy(x => x.Name).ToListAsync()).Select(x => (object)new { x.Id, x.Name, x.Phone, x.Email, x.TaxNumber, x.Active, x.CreatedAt, x.UpdatedAt }).ToArray(),
        "purchase-orders" => (await db.PurchaseOrders.AsNoTracking().Include(x => x.Lines).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.OrderedDate).ToListAsync()).Select(x => (object)new { x.Id, x.Number, x.SupplierId, x.StaffId, x.BranchId, x.Status, x.OrderedDate, x.ExpectedDate, x.Notes, x.Total, Lines = x.Lines.Select(l => new { l.ProductId, l.QuantityOrdered, l.QuantityReceived, l.UnitCost, l.LineTotal }) }).ToArray(),
        "production-runs" => (await db.ProductionRuns.AsNoTracking().Where(x => x.IsDemo == demo).OrderBy(x => x.OccurredAt).ToListAsync()).Select(x => (object)new { x.Id, x.RecipeId, x.ProductId, x.StaffId, x.QuantityProduced, x.TotalCost, x.Status, x.Notes, x.CostBreakdownJson, x.OccurredAt }).ToArray(),
        "recipes" => (await db.Recipes.AsNoTracking().Include(x => x.Ingredients).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.Name).ToListAsync()).Select(x => (object)new { x.Id, x.ProductId, x.Name, x.YieldQuantity, x.Version, x.Active, x.Notes, Ingredients = x.Ingredients.Select(i => new { i.IngredientProductId, i.Quantity, i.WastePercent }) }).ToArray(),
        "stocktakes" => (await db.StocktakeSessions.AsNoTracking().Include(x => x.Lines).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.CountDate).ToListAsync()).Select(x => (object)new { x.Id, x.Name, x.StaffId, x.Status, x.CountDate, x.SubmittedAt, x.ApprovedAt, Lines = x.Lines.Select(l => new { l.ProductId, l.ExpectedQuantity, l.CountedQuantity, l.Variance, l.LotNumber, l.ExpiryDate, l.Notes }) }).ToArray(),
        "accounting-journals" => (await db.JournalEntries.AsNoTracking().Include(x => x.Lines).AsSplitQuery().Where(x => x.IsDemo == demo).OrderBy(x => x.Date).ToListAsync()).Select(x => (object)new { x.Id, x.Date, x.SourceType, x.SourceId, x.Memo, x.Status, Lines = x.Lines.Select(l => new { l.AccountId, l.Description, l.Debit, l.Credit }) }).ToArray(),
        _ => []
    };

    static Guid? StaffId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;
    static async Task<IResult> ImportCustomers(BulkCustomerImportRequest request, AppDbContext db, ClaimsPrincipal principal, HttpContext context)
    {
        if (request.Rows.Count is < 1 or > 5000) return Results.BadRequest(new { error = "Import between 1 and 5,000 customer rows at a time." });
        if (request.Rows.Any(x => string.IsNullOrWhiteSpace(x.Name) || x.CreditLimit < 0)) return Results.BadRequest(new { error = "Each customer needs a name and a non-negative credit limit." });
        var phoneKeys = request.Rows.Where(x => !string.IsNullOrWhiteSpace(x.Phone)).Select(x => x.Phone!.Trim()).ToList();
        if (phoneKeys.Distinct(StringComparer.OrdinalIgnoreCase).Count() != phoneKeys.Count) return Results.BadRequest(new { error = "A phone number appears more than once in the uploaded file." });
        var demo = Security.IsDemo(principal); var existing = await db.Customers.Where(x => x.IsDemo == demo).ToListAsync(); var created = 0; var updated = 0;
        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var row in request.Rows)
        {
            var match = row.Id is Guid id ? existing.FirstOrDefault(x => x.Id == id) : null;
            match ??= string.IsNullOrWhiteSpace(row.Phone) ? null : existing.FirstOrDefault(x => string.Equals(x.Phone?.Trim(), row.Phone.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match is null) { match = new Customer { Name = row.Name.Trim(), IsDemo = demo }; db.Customers.Add(match); existing.Add(match); created++; }
            else updated++;
            match.Name = row.Name.Trim(); match.Phone = string.IsNullOrWhiteSpace(row.Phone) ? null : row.Phone.Trim(); match.CreditLimit = row.CreditLimit; match.Notes = row.Notes?.Trim(); match.Active = row.Active; match.UpdatedAt = DateTimeOffset.UtcNow;
        }
        db.AuditEvents.Add(new AuditEvent { StaffId = StaffId(principal), Actor = principal.Identity?.Name ?? "Staff", Action = "Bulk imported", EntityType = "Customer", Details = $"{request.Rows.Count} rows · {created} created · {updated} updated", DeviceId = request.DeviceId });
        await db.SaveChangesAsync(); await tx.CommitAsync(); context.Response.Headers["X-Records-Affected"] = request.Rows.Count.ToString();
        return Results.Ok(new { created, updated, total = request.Rows.Count });
    }
    static async Task<IResult> ImportExpenses(BulkExpenseImportRequest request, AppDbContext db, ClaimsPrincipal principal, HttpContext context)
    {
        if (request.Rows.Count is < 1 or > 5000) return Results.BadRequest(new { error = "Import between 1 and 5,000 expense rows at a time." });
        if (request.Rows.Any(x => x.Date == default || string.IsNullOrWhiteSpace(x.Category) || string.IsNullOrWhiteSpace(x.Description) || x.Amount <= 0 || x.TaxAmount < 0 || x.TaxAmount > x.Amount || x.DueDate < x.Date || x.Type is not ("Operating" or "InventoryPurchase")))
            return Results.BadRequest(new { error = "Each expense needs a date, category, description, positive amount, valid tax and supported expense type. Due date cannot be earlier than expense date." });
        var demo = Security.IsDemo(principal); var staffId = StaffId(principal); var created = new List<Expense>(); var skipped = 0;
        var existingIds = request.Rows.Where(x => x.Id.HasValue).Select(x => x.Id!.Value).ToList();
        var existing = await db.Expenses.Where(x => x.IsDemo == demo && existingIds.Contains(x.Id)).Select(x => x.Id).ToHashSetAsync();
        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var row in request.Rows)
        {
            if (row.Id is Guid id && existing.Contains(id)) { skipped++; continue; }
            var expense = new Expense { Id = row.Id ?? Guid.NewGuid(), Date = row.Date, Category = row.Category.Trim(), Description = row.Description.Trim(), Amount = Math.Round(row.Amount, 2), PaidAmount = 0, Method = "Cash", Payee = row.Payee?.Trim(), Reference = row.Reference?.Trim(), DueDate = row.DueDate, TaxAmount = Math.Round(row.TaxAmount, 2), Notes = row.Notes?.Trim(), Type = row.Type, Recurring = row.Recurring, Status = "PendingApproval", Active = true, IsDemo = demo };
            db.Expenses.Add(expense); created.Add(expense);
        }
        db.AuditEvents.Add(new AuditEvent { StaffId = staffId, Actor = principal.Identity?.Name ?? "Staff", Action = "Bulk imported for approval", EntityType = "Expense", Details = $"{request.Rows.Count} rows · {created.Count} created as pending approval · {skipped} duplicates skipped · no payment records imported", DeviceId = request.DeviceId });
        await db.SaveChangesAsync(); await tx.CommitAsync(); context.Response.Headers["X-Records-Affected"] = created.Count.ToString();
        return Results.Ok(new { created = created.Count, skipped, status = "PendingApproval", total = request.Rows.Count });
    }
    static string ToCsv(IEnumerable<object> rows, JsonSerializerOptions options)
    {
        var documents = rows.Select(row => JsonDocument.Parse(JsonSerializer.Serialize(row, options))).ToList();
        if (documents.Count == 0) return "";
        var columns = documents.SelectMany(x => x.RootElement.EnumerateObject().Select(p => p.Name)).Distinct().ToList();
        static string Cell(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
        var lines = new List<string> { string.Join(",", columns.Select(Cell)) };
        foreach (var document in documents)
            lines.Add(string.Join(",", columns.Select(name => document.RootElement.TryGetProperty(name, out var value) ? Cell(value.ValueKind is JsonValueKind.Object or JsonValueKind.Array ? value.GetRawText() : value.ValueKind == JsonValueKind.Null ? "" : value.ToString()) : "")));
        foreach (var document in documents) document.Dispose();
        return string.Join("\r\n", lines);
    }
}
