using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class HistoricalSalesEndpoints
{
    public static void MapHistoricalSalesApi(this WebApplication app)
    {
        var api=app.MapGroup("/api/historical-sales").RequireAuthorization(p=>p.RequireRole("Owner","Manager"));
        api.MapPost("/import", async (HistoricalSalesImportRequest request, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if(request.Rows is null || request.Rows.Count==0 || request.Rows.Count>5000)return Results.BadRequest(new{error="Import between 1 and 5,000 historical sale rows"});
            var demo=Security.IsDemo(principal);var products=await db.Products.Where(x=>x.IsDemo==demo&&x.Active).ToListAsync();var byBarcode=products.Where(x=>!string.IsNullOrWhiteSpace(x.Barcode)).ToDictionary(x=>x.Barcode!,StringComparer.OrdinalIgnoreCase);var byName=products.GroupBy(x=>x.Name,StringComparer.OrdinalIgnoreCase).ToDictionary(x=>x.Key,x=>x.First(),StringComparer.OrdinalIgnoreCase);var errors=new List<string>();var lines=new List<(HistoricalSaleRow Row,Product Product)>();
            foreach(var row in request.Rows){if(row.Date==default)errors.Add($"Row {row.RowNumber}: date is required");if(row.Quantity<=0||row.Quantity!=decimal.Truncate(row.Quantity))errors.Add($"Row {row.RowNumber}: quantity must be a positive whole number");if(row.UnitPrice<0)errors.Add($"Row {row.RowNumber}: unit price cannot be negative");Product? product=null;if(!string.IsNullOrWhiteSpace(row.Barcode))byBarcode.TryGetValue(row.Barcode.Trim(),out product);if(product is null&&!string.IsNullOrWhiteSpace(row.ProductName))byName.TryGetValue(row.ProductName.Trim(),out product);if(product is null)errors.Add($"Row {row.RowNumber}: product was not found");else lines.Add((row,product));}
            if(errors.Count>0)return Results.BadRequest(new{error="Historical import was rejected; no records were changed",errors});
            if(lines.GroupBy(x=>x.Product.Id).Any(g=>g.Sum(x=>x.Row.Quantity)>g.First().Product.Stock))return Results.Conflict(new{error="Historical import would drive stock below zero; adjust opening stock first or import in chronological order"});
            await using var tx=await db.Database.BeginTransactionAsync();var created=0;foreach(var (row,p) in lines){var sale=new Sale{DeviceTransactionId=$"historical-{Guid.NewGuid():N}",ReceiptNumber=await NextReceipt(db),DailyOrderNumber=0,CustomerId=null,StaffId=StaffId(principal),Status="Paid",OccurredAt=row.Date.ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc),PostedAt=row.Date.ToDateTime(TimeOnly.MinValue,DateTimeKind.Utc),IsDemo=demo,Notes="Historical import"};sale.Items.Add(new SaleItem{ProductId=p.Id,ProductName=p.Name,Quantity=row.Quantity,UnitPrice=row.UnitPrice,UnitCost=p.CostPrice});sale.Total=row.Quantity*row.UnitPrice;sale.Payments.Add(new Payment{Method=string.IsNullOrWhiteSpace(row.PaymentMethod)?"Cash":row.PaymentMethod.Trim(),Amount=sale.Total,PaidAt=sale.OccurredAt});p.Stock-=row.Quantity;db.StockMovements.Add(new StockMovement{ProductId=p.Id,StaffId=StaffId(principal),Type="Historical sale import",QuantityChange=-row.Quantity,Notes=sale.DeviceTransactionId,OccurredAt=sale.OccurredAt});db.Sales.Add(sale);db.AuditEvents.Add(new AuditEvent{StaffId=StaffId(principal),Actor=principal.Identity?.Name??"Staff",Action="Imported",EntityType="HistoricalSale",EntityId=sale.Id.ToString(),Details=$"{p.Name} · {row.Quantity} · {sale.Total} · {row.Date:yyyy-MM-dd}",DeviceId=request.DeviceId});created++;}await db.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{created,updated=0,skipped=0});
        });
    }
    static async Task<long> NextReceipt(AppDbContext db)=>(await db.Sales.MaxAsync(x=>(long?)x.ReceiptNumber)??1000)+1;
    static Guid StaffId(ClaimsPrincipal p)=>Guid.TryParse(p.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,out var id)?id:Guid.Empty;
}

public record HistoricalSalesImportRequest(string? DeviceId,List<HistoricalSaleRow> Rows);
public record HistoricalSaleRow(int RowNumber,DateOnly Date,string? Barcode,string? ProductName,decimal Quantity,decimal UnitPrice,string? PaymentMethod,string? CustomerName);
