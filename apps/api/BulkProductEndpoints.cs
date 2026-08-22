using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class BulkProductEndpoints
{
    public static void MapBulkProductApi(this WebApplication app)
    {
        app.MapPost("/api/products/single", CreateSingle)
            .RequireAuthorization(p => p.RequireRole("Owner", "Manager", "Storekeeper"));
        app.MapPost("/api/products/bulk-import", Import)
            .RequireAuthorization(p => p.RequireRole("Owner", "Manager", "Storekeeper"));
        app.MapGet("/api/products/import-batches", async (AppDbContext db) =>
            await db.ProductImportBatches.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(25).ToListAsync())
            .RequireAuthorization(p => p.RequireRole("Owner", "Manager", "Storekeeper"));
        app.MapPost("/api/products/import-batches/{id:guid}/reverse", Reverse)
            .RequireAuthorization(p => p.RequireRole("Owner", "Manager"));
    }

    static async Task<IResult> CreateSingle(ProductRequest request, AppDbContext db, ClaimsPrincipal principal)
    {
        var row = new BulkProductRow(1, request.Name, request.Category, request.Brand, request.Barcode, request.Unit,
            request.PackageQuantity, request.PackageUnit ?? request.Unit, request.TrackingMode, request.CostPrice,
            request.SellingPrice, request.Stock, request.MinStock, request.Supplier, request.TaxRate, request.Sellable);
        var errors = ProductImportRules.Validate([row]);
        if (errors.Count > 0) return Results.BadRequest(new { error = "Invalid product", errors });
        var barcode = Clean(request.Barcode);
        if (barcode is not null && await db.Products.AnyAsync(x => x.Barcode == barcode))
            return Results.Conflict(new { error = "Barcode/SKU already exists" });
        var product = new Product { Name = request.Name.Trim(), Category = request.Category.Trim(), Stock = request.Stock };
        ApplyDetails(product, row, barcode); db.Products.Add(product);
        var staffId = Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var sid) ? sid : Guid.Empty;
        if (request.Stock != 0) AddMovement(db, product, staffId, request.Stock, Guid.NewGuid());
        db.AuditEvents.Add(new AuditEvent { StaffId = staffId, Actor = principal.Identity?.Name ?? "System", Action = "Created", EntityType = "Product", EntityId = product.Id.ToString(), Details = $"{product.Name} · {product.PackageQuantity} {product.PackageUnit}" });
        await db.SaveChangesAsync(); return Results.Created($"/api/products/{product.Id}", product);
    }

    static async Task<IResult> Import(BulkProductImportRequest request, AppDbContext db, ClaimsPrincipal principal)
    {
        if (request.Rows.Count is < 1 or > 5000)
            return Results.BadRequest(new { error = "Import between 1 and 5,000 rows at a time" });
        if (!new[] { "Skip", "Update", "AddStock" }.Contains(request.DuplicatePolicy))
            return Results.BadRequest(new { error = "Duplicate policy must be Skip, Update or AddStock" });

        var errors = ProductImportRules.Validate(request.Rows);
        if (errors.Count > 0) return Results.BadRequest(new { error = "Correct the invalid rows before importing", errors });

        var existing = await db.Products.ToListAsync();
        var batchId = Guid.NewGuid();
        var staffId = Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var sid) ? sid : Guid.Empty;
        var created = 0; var updated = 0; var stockAdded = 0; var skipped = 0;
        await using var tx = await db.Database.BeginTransactionAsync();
        var batch=new ProductImportBatch{Id=batchId,StaffId=staffId,DuplicatePolicy=request.DuplicatePolicy,TotalRows=request.Rows.Count,DeviceId=request.DeviceId};db.ProductImportBatches.Add(batch);
        foreach (var row in request.Rows)
        {
            var barcode = Clean(row.Barcode);
            var match = existing.FirstOrDefault(x => barcode is not null && x.Barcode == barcode)
                ?? existing.FirstOrDefault(x => x.Name.Equals(row.Name.Trim(), StringComparison.OrdinalIgnoreCase)
                    && x.Category.Equals(row.Category.Trim(), StringComparison.OrdinalIgnoreCase)
                    && x.PackageQuantity == row.PackageQuantity
                    && x.PackageUnit.Equals(ProductImportRules.Unit(row.PackageUnit), StringComparison.OrdinalIgnoreCase));
            if (match is not null && request.DuplicatePolicy == "Skip") { skipped++; continue; }
            if (match is null)
            {
                match = new Product { Name = row.Name.Trim(), Category = row.Category.Trim() };
                ApplyDetails(match, row, barcode);
                match.Stock = row.OpeningStock;
                db.Products.Add(match); existing.Add(match); created++;
                if (row.OpeningStock != 0) AddMovement(db, match, staffId, row.OpeningStock, batchId);
                batch.Lines.Add(new ProductImportLine{ProductId=match.Id,ProductWasCreated=true,StockChange=row.OpeningStock});
            }
            else
            {
                var previous=JsonSerializer.Serialize(ProductSnapshot.From(match));
                ApplyDetails(match, row, barcode);
                match.Active = true;
                if (request.DuplicatePolicy == "AddStock" && row.OpeningStock != 0)
                {
                    match.Stock += row.OpeningStock; stockAdded++;
                    AddMovement(db, match, staffId, row.OpeningStock, batchId);
                }
                batch.Lines.Add(new ProductImportLine{ProductId=match.Id,ProductWasCreated=false,StockChange=request.DuplicatePolicy=="AddStock"?row.OpeningStock:0,PreviousJson=previous});
                updated++;
            }
        }
        batch.CreatedCount=created;batch.UpdatedCount=updated;batch.SkippedCount=skipped;
        db.AuditEvents.Add(new AuditEvent
        {
            StaffId = staffId == Guid.Empty ? null : staffId,
            Actor = principal.Identity?.Name ?? "System",
            Action = "Bulk imported",
            EntityType = "ProductImport",
            EntityId = batchId.ToString(),
            Details = $"{request.Rows.Count} rows · {created} created · {updated} updated · {stockAdded} stock additions · {skipped} skipped · policy {request.DuplicatePolicy}",
            DeviceId = request.DeviceId
        });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return Results.Ok(new { batchId, created, updated, stockAdded, skipped, total = request.Rows.Count });
    }

    static async Task<IResult> Reverse(Guid id, AppDbContext db, ClaimsPrincipal principal)
    {
        var batch=await db.ProductImportBatches.Include(x=>x.Lines).SingleOrDefaultAsync(x=>x.Id==id);if(batch is null)return Results.NotFound();if(batch.Status=="Reversed")return Results.Conflict(new{error="This import was already reversed"});
        var productIds=batch.Lines.Select(x=>x.ProductId).Distinct().ToList();
        var changedByStock=await db.StockMovements.AsNoTracking().Where(x=>productIds.Contains(x.ProductId)&&x.OccurredAt>batch.CreatedAt&&(x.Notes==null||!x.Notes.Contains(batch.Id.ToString()))).Select(x=>x.ProductId).Distinct().ToListAsync();
        var idTexts=productIds.Select(x=>x.ToString()).ToList();var changedByEdit=await db.AuditEvents.AsNoTracking().Where(x=>x.OccurredAt>batch.CreatedAt&&x.EntityType=="Product"&&x.EntityId!=null&&idTexts.Contains(x.EntityId)).Select(x=>x.EntityId!).ToListAsync();
        var blocked=changedByStock.Concat(changedByEdit.Select(Guid.Parse)).Distinct().ToList();if(blocked.Count>0){var names=await db.Products.Where(x=>blocked.Contains(x.Id)).Select(x=>x.Name).ToListAsync();return Results.Conflict(new{error="Import cannot be reversed because later activity depends on it",products=names});}
        var products=await db.Products.Where(x=>productIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id);var staffId=Guid.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value,out var sid)?sid:Guid.Empty;await using var tx=await db.Database.BeginTransactionAsync();
        foreach(var line in batch.Lines){if(!products.TryGetValue(line.ProductId,out var product))continue;var beforeStock=product.Stock;if(line.ProductWasCreated){product.Active=false;product.Stock=0;}else if(line.PreviousJson is not null){var previous=JsonSerializer.Deserialize<ProductSnapshot>(line.PreviousJson)!;previous.Restore(product);}var delta=product.Stock-beforeStock;if(delta!=0)db.StockMovements.Add(new StockMovement{ProductId=product.Id,StaffId=staffId,Type="Bulk import reversal",QuantityChange=delta,Notes=$"Reversed bulk import {batch.Id}",OccurredAt=DateTimeOffset.UtcNow});}
        batch.Status="Reversed";batch.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(new AuditEvent{StaffId=staffId,Actor=principal.Identity?.Name??"System",Action="Reversed",EntityType="ProductImport",EntityId=batch.Id.ToString(),Details=$"Reversed {batch.Lines.Count} imported item changes"});await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{batch.Id,batch.Status,items=batch.Lines.Count});
    }

    static void ApplyDetails(Product product, BulkProductRow row, string? barcode)
    {
        product.Name = row.Name.Trim(); product.Category = row.Category.Trim(); product.Brand = Clean(row.Brand);
        product.Barcode = barcode; product.Unit = ProductImportRules.Unit(row.StockUnit);
        product.PackageQuantity = row.PackageQuantity; product.PackageUnit = ProductImportRules.Unit(row.PackageUnit);
        product.TrackingMode = ProductImportRules.Mode(row.TrackingMode); product.Supplier = Clean(row.Supplier);
        product.TaxRate = row.TaxRate; product.CostPrice = row.CostPrice; product.SellingPrice = row.SellingPrice;
        product.MinStock = row.MinimumStock; product.Sellable = row.Sellable;
    }

    static void AddMovement(AppDbContext db, Product product, Guid staffId, decimal quantity, Guid batchId) =>
        db.StockMovements.Add(new StockMovement { ProductId = product.Id, StaffId = staffId, Type = "Opening stock import", QuantityChange = quantity, Notes = $"Bulk import {batchId}", OccurredAt = DateTimeOffset.UtcNow });
    static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public static class ProductImportRules
{
    static readonly Dictionary<string,string> Units = new(StringComparer.OrdinalIgnoreCase)
    {
        ["item"]="item",["piece"]="piece",["pieces"]="piece",["pc"]="piece",["pcs"]="piece",
        ["bottle"]="bottle",["bottles"]="bottle",["can"]="can",["cans"]="can",["pack"]="pack",["packs"]="pack",
        ["tray"]="tray",["trays"]="tray",["bag"]="bag",["bags"]="bag",["portion"]="portion",["portions"]="portion",
        ["serving"]="serving",["servings"]="serving",["shot"]="shot",["shots"]="shot",["glass"]="glass",["glasses"]="glass",
        ["ml"]="ml",["millilitre"]="ml",["milliliter"]="ml",["l"]="L",["litre"]="L",["liter"]="L",
        ["g"]="g",["gram"]="g",["grams"]="g",["kg"]="kg",["kilogram"]="kg",["kilograms"]="kg"
    };
    public static string Unit(string? value) => value is not null && Units.TryGetValue(value.Trim(), out var unit) ? unit : value?.Trim() ?? "item";
    public static string Mode(string? value) => value?.Trim().Equals("Measured", StringComparison.OrdinalIgnoreCase) == true ? "Measured" : "Discrete";
    public static List<ProductImportError> Validate(IReadOnlyList<BulkProductRow> rows)
    {
        var errors = new List<ProductImportError>(); var barcodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);var variants=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i]; var rowNo = row.RowNumber > 0 ? row.RowNumber : i + 2; var messages = new List<string>();
            if (string.IsNullOrWhiteSpace(row.Name)) messages.Add("Item name is required");
            if (string.IsNullOrWhiteSpace(row.Category)) messages.Add("Category is required");
            if (!Units.ContainsKey(row.StockUnit?.Trim() ?? "")) messages.Add("Stock unit is not supported");
            if (!Units.ContainsKey(row.PackageUnit?.Trim() ?? "")) messages.Add("Package unit is not supported");
            if (row.PackageQuantity <= 0) messages.Add("Package quantity must be greater than zero");
            if (row.OpeningStock < 0 || row.MinimumStock < 0) messages.Add("Stock values cannot be negative");
            if (row.CostPrice < 0 || row.SellingPrice < 0) messages.Add("Prices cannot be negative");
            if (row.TaxRate is < 0 or > 100) messages.Add("Tax rate must be between 0 and 100");
            if (!new[] { "Discrete", "Measured" }.Contains(row.TrackingMode?.Trim(), StringComparer.OrdinalIgnoreCase)) messages.Add("Tracking mode is invalid");
            if (Mode(row.TrackingMode) == "Discrete" && (row.OpeningStock != decimal.Truncate(row.OpeningStock) || row.MinimumStock != decimal.Truncate(row.MinimumStock))) messages.Add("Discrete stock must use whole quantities");
            if (DecimalPlaces(row.OpeningStock) > 3 || DecimalPlaces(row.MinimumStock) > 3 || DecimalPlaces(row.PackageQuantity) > 3) messages.Add("Quantities support at most 3 decimal places");
            if (!string.IsNullOrWhiteSpace(row.Barcode) && !barcodes.Add(row.Barcode.Trim())) messages.Add("Barcode/SKU is duplicated in this file");
            var variant=$"{row.Name.Trim()}|{row.Category.Trim()}|{row.PackageQuantity}|{Unit(row.PackageUnit)}";if(!variants.Add(variant))messages.Add("The same item and package-size variant is duplicated in this file");
            if (messages.Count > 0) errors.Add(new ProductImportError(rowNo, messages));
        }
        return errors;
    }
    static int DecimalPlaces(decimal value) => (decimal.GetBits(value)[3] >> 16) & 0x7F;
}

public record BulkProductImportRequest(string DuplicatePolicy, string? DeviceId, List<BulkProductRow> Rows);
public record BulkProductRow(int RowNumber, string Name, string Category, string? Brand, string? Barcode, string StockUnit, decimal PackageQuantity, string PackageUnit, string TrackingMode, decimal CostPrice, decimal SellingPrice, decimal OpeningStock, decimal MinimumStock, string? Supplier, decimal TaxRate, bool Sellable);
public record ProductImportError(int RowNumber, List<string> Errors);
public record ProductSnapshot(string Name,string Category,string? Brand,string? Barcode,string Unit,decimal PackageQuantity,string PackageUnit,string TrackingMode,string? Supplier,decimal TaxRate,decimal CostPrice,decimal SellingPrice,decimal Stock,decimal MinStock,bool Sellable,bool Active)
{
    public static ProductSnapshot From(Product x)=>new(x.Name,x.Category,x.Brand,x.Barcode,x.Unit,x.PackageQuantity,x.PackageUnit,x.TrackingMode,x.Supplier,x.TaxRate,x.CostPrice,x.SellingPrice,x.Stock,x.MinStock,x.Sellable,x.Active);
    public void Restore(Product x){x.Name=Name;x.Category=Category;x.Brand=Brand;x.Barcode=Barcode;x.Unit=Unit;x.PackageQuantity=PackageQuantity;x.PackageUnit=PackageUnit;x.TrackingMode=TrackingMode;x.Supplier=Supplier;x.TaxRate=TaxRate;x.CostPrice=CostPrice;x.SellingPrice=SellingPrice;x.Stock=Stock;x.MinStock=MinStock;x.Sellable=Sellable;x.Active=Active;x.UpdatedAt=DateTimeOffset.UtcNow;}
}
