using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class ExpenseEndpoints
{
    public static void MapExpenseApi(this WebApplication app)
    {
        var api=app.MapGroup("/api/expenses").RequireAuthorization();
        api.MapGet("/production",async(DateOnly? from,DateOnly? to,string? category,string? status,AppDbContext db,ClaimsPrincipal principal)=>
        {
            var demo=Security.IsDemo(principal);var query=db.Expenses.AsNoTracking().Where(x=>x.IsDemo==demo).Include(x=>x.Payments).AsQueryable();
            if(from is not null)query=query.Where(x=>x.Date>=from);if(to is not null)query=query.Where(x=>x.Date<=to);if(!string.IsNullOrWhiteSpace(category)&&category!="All")query=query.Where(x=>x.Category==category);if(!string.IsNullOrWhiteSpace(status)&&status!="All")query=query.Where(x=>x.Status==status);
            var rows=await query.Select(x=>new{x.Id,x.Date,x.Category,x.Description,x.Amount,x.PaidAmount,balance=x.Amount-x.PaidAmount,x.Method,x.Payee,x.Reference,x.DueDate,x.TaxAmount,x.Notes,x.Recurring,x.Status,x.BranchId,x.Active,x.CreatedAt,payments=x.Payments.Select(p=>new{p.Id,p.Amount,p.Method,p.Reference,p.Notes,p.PaidAt})}).ToListAsync();
            return rows.OrderByDescending(x=>x.Date).ThenByDescending(x=>x.CreatedAt).Select(x=>new{x.Id,x.Date,x.Category,x.Description,x.Amount,x.PaidAmount,x.balance,x.Method,x.Payee,x.Reference,x.DueDate,x.TaxAmount,x.Notes,x.Recurring,x.Status,x.BranchId,x.Active,x.CreatedAt,payments=x.payments.OrderByDescending(p=>p.PaidAt)}).ToList();
        });
        api.MapPost("/production",async(ProductionExpenseRequest r,AppDbContext db,ClaimsPrincipal principal)=>
        {
            if(principal.IsInRole("Auditor"))return Results.Forbid();if(string.IsNullOrWhiteSpace(r.Category)||string.IsNullOrWhiteSpace(r.Description)||r.Amount<=0||r.InitiallyPaid<0||r.InitiallyPaid>r.Amount)return Results.BadRequest(new{error="Category, description and a valid amount/payment are required"});
            if(r.BranchId is Guid branch&&!await db.Branches.AnyAsync(x=>x.Id==branch&&x.Active))return Results.BadRequest(new{error="Choose an active branch"});
            var staffId=StaffId(principal);var privileged=principal.IsInRole("Owner")||principal.IsInRole("Manager");var expense=new Expense{Date=r.Date,Category=r.Category.Trim(),Description=r.Description.Trim(),Amount=r.Amount,PaidAmount=r.InitiallyPaid,Method=r.Method.Trim(),Payee=r.Payee?.Trim(),Reference=r.Reference?.Trim(),DueDate=r.DueDate,TaxAmount=Math.Max(0,r.TaxAmount),Notes=r.Notes?.Trim(),Recurring=r.Recurring,BranchId=r.BranchId,Status=privileged?"Approved":"PendingApproval",Active=true,IsDemo=Security.IsDemo(principal)};
            if(r.InitiallyPaid>0)expense.Payments.Add(new ExpensePayment{ExpenseId=expense.Id,Amount=r.InitiallyPaid,Method=r.Method.Trim(),Reference=r.Reference?.Trim(),Notes="Initial expense payment",StaffId=staffId});db.Expenses.Add(expense);db.AuditEvents.Add(Audit(principal,"Created",expense,$"{expense.Category} · {expense.Amount} · paid {expense.PaidAmount}",r.DeviceId));await db.SaveChangesAsync();return Results.Created($"/api/expenses/{expense.Id}",expense);
        }).RequireAuthorization(p=>p.RequireRole("Owner","Manager","Cashier","Storekeeper"));
        api.MapPost("/{id:guid}/approve",async(Guid id,AppDbContext db,ClaimsPrincipal principal)=>{var expense=await db.Expenses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsDemo==Security.IsDemo(principal)&&x.Active);if(expense is null)return Results.NotFound();expense.Status="Approved";expense.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Approved",expense,"Expense approved for reporting and payment","expense-approval"));await db.SaveChangesAsync();return Results.Ok(expense);}).RequireAuthorization(p=>p.RequireRole("Owner","Manager"));
        api.MapPost("/{id:guid}/payments",async(Guid id,ExpensePaymentRequest r,AppDbContext db,ClaimsPrincipal principal)=>
        {
            if(r.Amount<=0)return Results.BadRequest(new{error="Payment amount must be greater than zero"});var expense=await db.Expenses.Include(x=>x.Payments).SingleOrDefaultAsync(x=>x.Id==id&&x.IsDemo==Security.IsDemo(principal)&&x.Active);if(expense is null)return Results.NotFound();var balance=expense.Amount-expense.PaidAmount;if(r.Amount>balance)return Results.BadRequest(new{error=$"Payment exceeds the outstanding balance of {balance}"});var payment=new ExpensePayment{ExpenseId=id,Amount=r.Amount,Method=r.Method.Trim(),Reference=r.Reference?.Trim(),Notes=r.Notes?.Trim(),StaffId=StaffId(principal)};expense.Payments.Add(payment);expense.PaidAmount+=r.Amount;expense.Method=r.Method.Trim();expense.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Paid",expense,$"Expense payment {r.Amount} · balance {expense.Amount-expense.PaidAmount}",r.DeviceId));await db.SaveChangesAsync();return Results.Ok(new{expense.Id,expense.PaidAmount,balance=expense.Amount-expense.PaidAmount,payment});
        }).RequireAuthorization(p=>p.RequireRole("Owner","Manager"));
        api.MapPut("/{id:guid}",async(Guid id,ExpenseUpdateRequest r,AppDbContext db,ClaimsPrincipal principal)=>
        {
            if(string.IsNullOrWhiteSpace(r.Reason))return Results.BadRequest(new{error="A reason is required"});var expense=await db.Expenses.SingleOrDefaultAsync(x=>x.Id==id&&x.IsDemo==Security.IsDemo(principal));if(expense is null)return Results.NotFound();expense.Category=r.Category.Trim();expense.Description=r.Description.Trim();expense.Payee=r.Payee?.Trim();expense.Reference=r.Reference?.Trim();expense.DueDate=r.DueDate;expense.TaxAmount=Math.Max(0,r.TaxAmount);expense.Notes=r.Notes?.Trim();expense.Recurring=r.Recurring;expense.Active=r.Active;expense.Status=r.Active?expense.Status:"Archived";expense.UpdatedAt=DateTimeOffset.UtcNow;db.AuditEvents.Add(Audit(principal,"Updated",expense,r.Reason,"expense-editor"));await db.SaveChangesAsync();return Results.Ok(expense);
        }).RequireAuthorization(p=>p.RequireRole("Owner","Manager"));
    }
    static Guid StaffId(ClaimsPrincipal p)=>Guid.TryParse(p.FindFirst(ClaimTypes.NameIdentifier)?.Value,out var id)?id:throw new InvalidOperationException("Staff identity is missing");
    static AuditEvent Audit(ClaimsPrincipal p,string action,Expense e,string details,string? device)=>new(){StaffId=StaffId(p),Actor=p.Identity?.Name??"Staff",Action=action,EntityType="Expense",EntityId=e.Id.ToString(),Details=details,DeviceId=device};
}
