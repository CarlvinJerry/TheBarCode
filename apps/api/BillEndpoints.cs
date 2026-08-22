using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class BillEndpoints
{
    static readonly string[] PostedStatuses = ["Paid", "Credit", "PartiallyPaid"];

    public static void MapBillApi(this WebApplication app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        api.MapGet("/settings/insights",async(AppDbContext db)=>{var x=await db.InsightsConfigurations.FirstAsync();return Results.Ok(new{x.Enabled,x.Endpoint,x.Model,apiKeyConfigured=!string.IsNullOrWhiteSpace(x.EncryptedApiKey),x.AllowUserNames});}).RequireAuthorization(p=>p.RequireRole("Owner","Manager"));
        api.MapPut("/settings/insights",async(InsightsSettingsRequest r,AppDbContext db,ClaimsPrincipal principal,SecretProtector protector)=>{if(!Uri.TryCreate(r.Endpoint,UriKind.Absolute,out var uri)||uri.Scheme!="https"||string.IsNullOrWhiteSpace(r.Model))return Results.BadRequest(new{error="A valid HTTPS endpoint and model are required"});var x=await db.InsightsConfigurations.FirstAsync();x.Enabled=r.Enabled;x.Endpoint=r.Endpoint.Trim();x.Model=r.Model.Trim();x.AllowUserNames=r.AllowUserNames;if(r.ClearApiKey)x.EncryptedApiKey=null;else if(!string.IsNullOrWhiteSpace(r.ApiKey))x.EncryptedApiKey=protector.Protect(r.ApiKey.Trim());x.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Updated",x.Id,"InsightsConfiguration",$"Enabled {x.Enabled}; model {x.Model}; user names {x.AllowUserNames}"));await db.SaveChangesAsync();return Results.Ok(new{x.Enabled,x.Endpoint,x.Model,apiKeyConfigured=!string.IsNullOrWhiteSpace(x.EncryptedApiKey),x.AllowUserNames});}).RequireAuthorization(p=>p.RequireRole("Owner"));

        api.MapGet("/bills", async (string? status, DateOnly? from, DateOnly? to, AppDbContext db) =>
        {
            var query = db.Sales.AsNoTracking().Include(x => x.Items).Include(x => x.Payments).Include(x => x.Revisions).AsQueryable();
            if (!string.IsNullOrWhiteSpace(status) && status != "All")
                query = status == "Pending" ? query.Where(x => x.Status == "Held" || x.Status == "Credit" || x.Status == "PartiallyPaid") : query.Where(x => x.Status == status);
            var customers = await db.Customers.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);
            var staff = await db.Staff.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);
            var rows = (await query.Take(1000).ToListAsync()).Where(x => from is not DateOnly f || x.OccurredAt >= f.ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc)).Where(x => to is not DateOnly t || x.OccurredAt < t.AddDays(1).ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc)).OrderByDescending(x=>x.UpdatedAt).Take(500).ToList();
            return rows.Select(x => BillView(x, customers.GetValueOrDefault(x.CustomerId ?? Guid.Empty), staff.GetValueOrDefault(x.StaffId))).ToList();
        });

        api.MapPost("/bills/hold", async (HoldBillRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (r.Items.Count == 0 || r.Items.Any(x => x.Quantity <= 0 || x.Quantity != decimal.Truncate(x.Quantity) || x.UnitPrice < 0)) return Results.BadRequest(new { error = "Bill quantities must be positive whole units" });
            var duplicate = await db.Sales.Include(x => x.Items).Include(x => x.Payments).SingleOrDefaultAsync(x => x.DeviceTransactionId == r.DeviceTransactionId);
            if (duplicate is not null) return Results.Ok(BillView(duplicate, null, null));
            var products = await Products(r.Items, db);
            if (products is null) return Results.BadRequest(new { error = "One or more products no longer exist" });
            var sale = new Sale { DeviceTransactionId = r.DeviceTransactionId, ReceiptNumber = await NextNumber(db), CustomerId = r.CustomerId, StaffId = r.StaffId, Status = "Held", Discount = Math.Max(0, r.Discount), Notes = r.Notes?.Trim(), OccurredAt = DateTimeOffset.UtcNow };
            ReplaceLines(sale, r.Items, products);
            sale.Total = Total(sale);
            sale.Revisions.Add(Revision(sale, r.StaffId, "Held", "Initial unpaid bill"));
            db.Sales.Add(sale);
            db.AuditEvents.Add(Audit(principal, "Held", sale, $"Unpaid bill {sale.ReceiptNumber} · {sale.Total}", r.DeviceId));
            await db.SaveChangesAsync();
            return Results.Created($"/api/bills/{sale.Id}", BillView(sale, null, principal.Identity?.Name));
        });

        api.MapPut("/bills/{id:guid}", async (Guid id, UpdateBillRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            var sale = await db.Sales.Include(x => x.Items).Include(x => x.Payments).Include(x => x.Revisions).SingleOrDefaultAsync(x => x.Id == id);
            if (sale is null) return Results.NotFound();
            if (sale.Status != "Held") return Results.Conflict(new { error = "Only held bills can be edited. Posted bills require a controlled reversal." });
            if (r.ExpectedRevision != sale.Revision) return Results.Conflict(new { error = $"Bill changed on another terminal. Reload revision {sale.Revision} before editing." });
            if (r.Items.Count == 0 || r.Items.Any(x => x.Quantity <= 0 || x.Quantity != decimal.Truncate(x.Quantity) || x.UnitPrice < 0)) return Results.BadRequest(new { error = "Bill quantities must be positive whole units" });
            var oldTotal = sale.Total;
            var oldQty = sale.Items.Sum(x => x.Quantity);
            var newQty = r.Items.Sum(x => x.Quantity);
            var lowersValue = newQty < oldQty || r.Discount > sale.Discount || r.Items.Any(n => sale.Items.FirstOrDefault(o => o.ProductId == n.ProductId) is { } old && (n.Quantity < old.Quantity || n.UnitPrice < old.UnitPrice));
            if (lowersValue && !IsManager(principal)) return Results.Forbid();
            if (lowersValue && string.IsNullOrWhiteSpace(r.Reason)) return Results.BadRequest(new { error = "An owner/manager reason is required when reducing a held bill" });
            var products = await Products(r.Items, db);
            if (products is null) return Results.BadRequest(new { error = "One or more products no longer exist" });
            await using var tx=await db.Database.BeginTransactionAsync();
            var oldItems=sale.Items.ToList();await db.SaleItems.Where(x=>x.SaleId==sale.Id).ExecuteDeleteAsync();foreach(var oldItem in oldItems)db.Entry(oldItem).State=EntityState.Detached;sale.Items=[];
            ReplaceLines(sale, r.Items, products);
            foreach(var replacement in sale.Items)db.SaleItems.Add(replacement);
            sale.CustomerId = r.CustomerId;
            sale.Discount = Math.Max(0, r.Discount);
            sale.Notes = r.Notes?.Trim();
            sale.Total = Total(sale);
            sale.Revision++;
            sale.UpdatedAt = DateTimeOffset.UtcNow;
            db.BillRevisions.Add(Revision(sale, StaffId(principal), "Updated", string.IsNullOrWhiteSpace(r.Reason) ? "Items added or customer updated" : r.Reason.Trim()));
            db.AuditEvents.Add(Audit(principal, "Revised", sale, $"Revision {sale.Revision} · {oldTotal} to {sale.Total} · {r.Reason}", r.DeviceId));
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(BillView(sale, null, principal.Identity?.Name));
        });

        api.MapPost("/bills/{id:guid}/post", async (Guid id, PostBillRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            var sale = await db.Sales.Include(x => x.Items).Include(x => x.Payments).Include(x => x.Revisions).SingleOrDefaultAsync(x => x.Id == id);
            if (sale is null) return Results.NotFound();
            if (sale.Status != "Held") return Results.Conflict(new { error = "This bill has already been posted" });
            if (sale.Items.Any(x=>x.Quantity<=0||x.Quantity!=decimal.Truncate(x.Quantity)))return Results.BadRequest(new{error="Bill quantities must be positive whole units"});
            if (!PostedStatuses.Contains(r.Status)) return Results.BadRequest(new { error = "Status must be Paid, Credit or PartiallyPaid" });
            if (r.Status != "Paid" && sale.CustomerId is null) return Results.BadRequest(new { error = "Credit requires a registered customer" });
            var amount = Math.Clamp(r.AmountPaid, 0, sale.Total);
            if (r.Status == "Paid" && amount < sale.Total) return Results.BadRequest(new { error = "A paid sale requires full payment" });
            if (r.Status == "Credit" && amount > 0) return Results.BadRequest(new { error = "Use PartiallyPaid when receiving a deposit" });
            await using var tx = await db.Database.BeginTransactionAsync();
            var ids = sale.Items.Select(x => x.ProductId).ToList();
            var products = await db.Products.Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
            foreach (var line in sale.Items)
                if (!products.TryGetValue(line.ProductId, out var product) || product.Stock < line.Quantity)
                    return Results.Conflict(new { error = $"Insufficient stock for {line.ProductName}" });
            foreach (var line in sale.Items)
            {
                var product = products[line.ProductId];
                product.Stock -= line.Quantity;
                db.StockMovements.Add(new StockMovement { ProductId = product.Id, StaffId = sale.StaffId, Type = "Sale", QuantityChange = -line.Quantity, Notes = sale.DeviceTransactionId, OccurredAt = DateTimeOffset.UtcNow });
            }
            if (amount > 0) { var payment=new Payment { SaleId=sale.Id,Method = r.Method, Amount = amount, PaidAt = DateTimeOffset.UtcNow };db.Payments.Add(payment);sale.Payments.Add(payment); }
            sale.Status = amount >= sale.Total ? "Paid" : amount > 0 ? "PartiallyPaid" : "Credit";
            sale.DueAt = sale.Status == "Paid" ? null : r.DueAt;
            sale.PostedAt = DateTimeOffset.UtcNow;
            sale.Notes = r.Notes?.Trim() ?? sale.Notes;
            sale.UpdatedAt = DateTimeOffset.UtcNow;
            sale.Revision++;db.BillRevisions.Add(Revision(sale, StaffId(principal), "Posted", $"{sale.Status}; paid {amount}"));
            db.AuditEvents.Add(Audit(principal, "Posted", sale, $"{sale.Status} · total {sale.Total} · paid {amount}", r.DeviceId));
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(BillView(sale, null, principal.Identity?.Name));
        });

        api.MapPost("/bills/{id:guid}/payments", async (Guid id, BillPaymentRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            var sale = await db.Sales.Include(x => x.Items).Include(x => x.Payments).Include(x => x.Revisions).SingleOrDefaultAsync(x => x.Id == id);
            if (sale is null) return Results.NotFound();
            if (sale.Status is not ("Credit" or "PartiallyPaid")) return Results.Conflict(new { error = "Only outstanding posted bills can receive later payments" });
            var balance = sale.Total - sale.Payments.Sum(x => x.Amount);
            if (r.Amount <= 0 || r.Amount > balance) return Results.BadRequest(new { error = $"Payment must be between 0 and {balance}" });
            var payment=new Payment { SaleId=sale.Id,Method = r.Method, Amount = r.Amount, PaidAt = DateTimeOffset.UtcNow };db.Payments.Add(payment);sale.Payments.Add(payment);
            sale.Status = r.Amount >= balance ? "Paid" : "PartiallyPaid";
            sale.UpdatedAt = DateTimeOffset.UtcNow;
            sale.Revision++;db.BillRevisions.Add(Revision(sale, StaffId(principal), "Payment", $"{r.Method} {r.Amount}; {r.Reference}"));
            db.AuditEvents.Add(Audit(principal, "Payment", sale, $"{r.Method} {r.Amount} · balance {balance-r.Amount} · {r.Reference}", r.DeviceId));
            await db.SaveChangesAsync();
            return Results.Ok(BillView(sale, null, principal.Identity?.Name));
        });

        api.MapPost("/bills/{id:guid}/cancel", async (Guid id, string reason, string? deviceId, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!IsManager(principal)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(reason)) return Results.BadRequest(new { error = "A cancellation reason is required" });
            var sale = await db.Sales.Include(x => x.Items).Include(x => x.Payments).Include(x => x.Revisions).SingleOrDefaultAsync(x => x.Id == id);
            if (sale is null) return Results.NotFound();
            if (sale.Status != "Held") return Results.Conflict(new { error = "Posted sales require a refund/reversal workflow" });
            sale.Status = "Cancelled"; sale.UpdatedAt = DateTimeOffset.UtcNow;
            sale.Revision++;db.BillRevisions.Add(Revision(sale, StaffId(principal), "Cancelled", reason.Trim()));
            db.AuditEvents.Add(Audit(principal, "Cancelled", sale, reason.Trim(), deviceId));
            await db.SaveChangesAsync();
            return Results.Ok(BillView(sale, null, principal.Identity?.Name));
        });

        api.MapPost("/bills/{id:guid}/refund", async (Guid id, string reason, string? deviceId, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!IsManager(principal)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(reason)) return Results.BadRequest(new { error = "A refund reason is required" });
            var sale=await db.Sales.Include(x=>x.Items).Include(x=>x.Payments).Include(x=>x.Revisions).SingleOrDefaultAsync(x=>x.Id==id);
            if(sale is null)return Results.NotFound();if(!PostedStatuses.Contains(sale.Status))return Results.Conflict(new{error="Only a posted sale can be refunded"});
            await using var tx=await db.Database.BeginTransactionAsync();var ids=sale.Items.Select(x=>x.ProductId).ToList();var products=await db.Products.Where(x=>ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id);
            foreach(var line in sale.Items)if(products.TryGetValue(line.ProductId,out var p)){p.Stock+=line.Quantity;db.StockMovements.Add(new StockMovement{ProductId=p.Id,StaffId=StaffId(principal),Type="Refund",QuantityChange=line.Quantity,Notes=$"Refund {sale.ReceiptNumber}: {reason}",OccurredAt=DateTimeOffset.UtcNow});}
            var paid=sale.Payments.Sum(x=>x.Amount);if(paid>0){var reversal=new Payment{SaleId=sale.Id,Method="Refund",Amount=-paid,PaidAt=DateTimeOffset.UtcNow};db.Payments.Add(reversal);sale.Payments.Add(reversal);}sale.Status="Refunded";sale.UpdatedAt=DateTimeOffset.UtcNow;sale.Revision++;db.BillRevisions.Add(Revision(sale,StaffId(principal),"Refunded",reason.Trim()));db.AuditEvents.Add(Audit(principal,"Refunded",sale,$"{reason} · stock restored · payment reversal {paid}",deviceId));await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(BillView(sale,null,principal.Identity?.Name));
        });

        api.MapGet("/notifications", async (AppDbContext db) =>
        {
            var now = DateTimeOffset.UtcNow;var outstanding=await db.Sales.Where(x=>x.Status=="Credit"||x.Status=="PartiallyPaid").Select(x=>new{x.DueAt}).ToListAsync();var sensitiveActivity=await db.AuditEvents.Where(x=>x.Action=="Cancelled"||x.Action=="Revised").Select(x=>x.OccurredAt).ToListAsync();
            return Results.Ok(new
            {
                Sell = await db.Sales.CountAsync(x => x.Status == "Held"),
                Bills = await db.Sales.CountAsync(x => x.Status == "Held" || x.Status == "Credit" || x.Status == "PartiallyPaid"),
                Customers = outstanding.Count(x=>x.DueAt<now),
                Inventory = await db.Products.CountAsync(x => x.Active && x.Stock <= x.MinStock),
                Expenses = await db.Expenses.CountAsync(x => x.PaidAmount < x.Amount),
                AuditTrail = sensitiveActivity.Count(x=>x>=now.AddHours(-24)),
                Settings = 0
            });
        });

        api.MapGet("/audit/live", async (int? take, AppDbContext db) =>
            (await db.AuditEvents.AsNoTracking().Take(1000).ToListAsync()).OrderByDescending(x=>x.OccurredAt).Take(Math.Clamp(take??250,1,1000)).ToList())
            .RequireAuthorization(p=>p.RequireRole("Owner","Manager","Auditor"));

        api.MapGet("/reports/accurate",async(DateOnly from,DateOnly to,AppDbContext db)=>{if(to<from)(from,to)=(to,from);var start=from.ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc);var end=to.AddDays(1).ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc);var sales=(await db.Sales.AsNoTracking().Where(x=>x.Status=="Paid"||x.Status=="Credit"||x.Status=="PartiallyPaid").Include(x=>x.Items).ToListAsync()).Where(x=>x.OccurredAt>=start&&x.OccurredAt<end).ToList();var payments=(await db.Payments.AsNoTracking().ToListAsync()).Where(x=>x.PaidAt>=start&&x.PaidAt<end).ToList();var expenses=await db.Expenses.AsNoTracking().Where(x=>x.Date>=from&&x.Date<=to).ToListAsync();var revenue=sales.Sum(x=>x.Total);var cost=sales.SelectMany(x=>x.Items).Sum(x=>x.UnitCost*x.Quantity);var expenseTotal=expenses.Sum(x=>x.Amount);return Results.Ok(new{from,to,revenue,cost,grossProfit=revenue-cost,expenses=expenseTotal,netProfit=revenue-cost-expenseTotal,collected=payments.Sum(x=>x.Amount),salesCount=sales.Count,paymentMix=payments.GroupBy(x=>x.Method).Select(g=>new{method=g.Key,amount=g.Sum(x=>x.Amount)}).OrderByDescending(x=>x.amount)});}).RequireAuthorization(p=>p.RequireRole("Owner","Manager"));

        api.MapPut("/products/{id:guid}", async (Guid id, ProductUpdateRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!IsInventoryManager(principal)) return Results.Forbid();
            var x = await db.Products.FindAsync(id); if (x is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(r.Reason)) return Results.BadRequest(new { error = "A reason is required" });
            var before = JsonSerializer.Serialize(new { x.Name, x.SellingPrice, x.CostPrice, x.Active });
            var validation=ProductImportRules.Validate([new(1,r.Name,r.Category,r.Brand,r.Barcode,r.Unit,r.PackageQuantity,r.PackageUnit??r.Unit,r.TrackingMode,r.CostPrice,r.SellingPrice,0,r.MinStock,r.Supplier,r.TaxRate,r.Sellable)]);if(validation.Count>0)return Results.BadRequest(new{error="Invalid product",errors=validation});
            x.Name=r.Name.Trim();x.Category=r.Category.Trim();x.Brand=r.Brand?.Trim();x.Barcode=string.IsNullOrWhiteSpace(r.Barcode)?null:r.Barcode.Trim();x.Unit=ProductImportRules.Unit(r.Unit);x.PackageQuantity=r.PackageQuantity;x.PackageUnit=ProductImportRules.Unit(r.PackageUnit??r.Unit);x.TrackingMode=ProductImportRules.Mode(r.TrackingMode);x.Supplier=r.Supplier?.Trim();x.TaxRate=r.TaxRate;x.CostPrice=r.CostPrice;x.SellingPrice=r.SellingPrice;x.MinStock=r.MinStock;x.Sellable=r.Sellable;x.Active=r.Active;x.UpdatedAt=DateTimeOffset.UtcNow;
            db.AuditEvents.Add(Audit(principal,"Updated",x.Id,"Product",$"{r.Reason} · before {before}")); await db.SaveChangesAsync(); return Results.Ok(x);
        });

        api.MapPut("/customers/{id:guid}", async (Guid id, CustomerUpdateRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            var x=await db.Customers.FindAsync(id);if(x is null)return Results.NotFound();if(string.IsNullOrWhiteSpace(r.Reason))return Results.BadRequest(new{error="A reason is required"});x.Name=r.Name.Trim();x.Phone=r.Phone?.Trim();x.CreditLimit=Math.Max(0,r.CreditLimit);x.Notes=r.Notes?.Trim();x.Active=r.Active;x.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Updated",x.Id,"Customer",r.Reason));await db.SaveChangesAsync();return Results.Ok(x);
        });

        api.MapPut("/staff/{id:guid}", async (Guid id, StaffUpdateRequest r, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!principal.IsInRole("Owner")) return Results.Forbid();var x=await db.Staff.FindAsync(id);if(x is null)return Results.NotFound();if(string.IsNullOrWhiteSpace(r.Reason))return Results.BadRequest(new{error="A reason is required"});x.Name=r.Name.Trim();x.Role=r.Role;x.Active=r.Active;if(!string.IsNullOrWhiteSpace(r.NewPin)){if(r.NewPin.Length<6)return Results.BadRequest(new{error="PIN must be at least 6 characters"});x.PinHash=Security.HashPin(r.NewPin);}x.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Updated",x.Id,"Staff",r.Reason));await db.SaveChangesAsync();return Results.Ok(new{x.Id,x.Name,x.Role,x.Active,x.UpdatedAt});
        });
    }

    static async Task<Dictionary<Guid, Product>?> Products(IEnumerable<BillLineRequest> lines, AppDbContext db)
    { var ids=lines.Select(x=>x.ProductId).Distinct().ToList();var rows=await db.Products.Where(x=>ids.Contains(x.Id)&&x.Active).ToDictionaryAsync(x=>x.Id);return rows.Count==ids.Count?rows:null; }
    static void ReplaceLines(Sale sale,IEnumerable<BillLineRequest> lines,IReadOnlyDictionary<Guid,Product> products){foreach(var line in lines){var p=products[line.ProductId];sale.Items.Add(new SaleItem{ProductId=p.Id,ProductName=p.Name,Quantity=line.Quantity,UnitPrice=line.UnitPrice,UnitCost=p.CostPrice,Discount=Math.Max(0,line.Discount)});}}
    static decimal Total(Sale sale)=>Math.Max(0,sale.Items.Sum(x=>x.Quantity*x.UnitPrice-x.Discount)-sale.Discount);
    static async Task<long> NextNumber(AppDbContext db)=>(await db.Sales.MaxAsync(x=>(long?)x.ReceiptNumber)??1000)+1;
    static Guid StaffId(ClaimsPrincipal p)=>Guid.TryParse(p.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:Guid.Empty;
    static bool IsManager(ClaimsPrincipal p)=>p.IsInRole("Owner")||p.IsInRole("Manager");
    static bool IsInventoryManager(ClaimsPrincipal p)=>IsManager(p)||p.IsInRole("Storekeeper");
    static BillRevision Revision(Sale sale,Guid staffId,string action,string reason)=>new(){SaleId=sale.Id,Revision=sale.Revision,StaffId=staffId,Action=action,Reason=reason,SnapshotJson=JsonSerializer.Serialize(new{sale.CustomerId,sale.Status,sale.Discount,sale.Total,Items=sale.Items.Select(x=>new{x.ProductId,x.ProductName,x.Quantity,x.UnitPrice,x.Discount})})};
    static AuditEvent Audit(ClaimsPrincipal p,string action,Sale sale,string details,string? device)=>Audit(p,action,sale.Id,"Sale",details,device);
    static AuditEvent Audit(ClaimsPrincipal p,string action,Guid id,string type,string details,string? device=null)=>new(){StaffId=StaffId(p),Actor=p.Identity?.Name??"System",Action=action,EntityType=type,EntityId=id.ToString(),Details=details,DeviceId=device};
    static object BillView(Sale x,string? customer,string? cashier)=>new{x.Id,x.DeviceTransactionId,x.ReceiptNumber,x.CustomerId,customerName=customer,x.StaffId,cashierName=cashier,x.Status,x.Discount,x.Total,x.OccurredAt,x.DueAt,x.PostedAt,x.Revision,x.Notes,paid=x.Payments.Sum(p=>p.Amount),balance=Math.Max(0,x.Total-x.Payments.Sum(p=>p.Amount)),items=x.Items.OrderBy(i=>i.CreatedAt),payments=x.Payments.OrderBy(p=>p.PaidAt),revisions=x.Revisions.OrderByDescending(r=>r.Revision)};
}
