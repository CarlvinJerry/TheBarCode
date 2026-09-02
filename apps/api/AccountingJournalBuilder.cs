using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

/// <summary>Reconciles operational source journals while preserving manual adjustments.</summary>
public static class AccountingJournalBuilder
{
    public static async Task Ensure(AppDbContext db, bool demo)
    {
        try { await Reconcile(db, demo); }
        catch (DbUpdateConcurrencyException)
        {
            // A concurrent terminal may have refreshed the same derived journal.
            // Never prevent the API from starting; operational accounting overview
            // remains calculated directly from sales and expenses.
            db.ChangeTracker.Clear();
        }
    }

    public static async Task Reconcile(AppDbContext db, bool demo)
    {
        var accounts = await db.LedgerAccounts.Where(x => x.IsDemo == demo && x.Active).ToDictionaryAsync(x => x.Code);
        if (accounts.Count == 0) return;
        var entries = await db.JournalEntries.AsNoTracking().Include(x => x.Lines).Where(x => x.IsDemo == demo && x.SourceId != null).ToListAsync();
        var latest = entries.GroupBy(x => x.SourceId!).ToDictionary(x => x.Key, x => x.OrderByDescending(y => y.CreatedAt).First());
        var sales = await db.Sales.AsNoTracking().Include(x => x.Items).Include(x => x.Payments).Where(x => x.IsDemo == demo && x.Status != "Held" && x.Status != "PendingApproval" && x.Status != "Cancelled").ToListAsync();
        foreach (var sale in sales)
        {
            var key = $"sale:{sale.Id}"; var lines = SaleLines(sale, accounts); AddOrCorrect(db, latest.GetValueOrDefault(key), key, "Sale", $"Sale {sale.ReceiptNumber}", sale.UpdatedAt, DateOnly.FromDateTime(sale.OccurredAt.LocalDateTime), sale.Status, lines, demo);
        }
        var expenses = await db.Expenses.AsNoTracking().Where(x => x.IsDemo == demo && x.Active && x.Status == "Approved").ToListAsync();
        foreach (var expense in expenses)
        {
            var key = $"expense:{expense.Id}"; var lines = new List<JournalLine>{new() { AccountId = accounts["6000"].Id, Description = expense.Category, Debit = Math.Round(expense.Amount, 2) }}; var paid = Math.Min(expense.Amount, expense.PaidAmount); if (paid > 0) lines.Add(new JournalLine { AccountId = accounts["1000"].Id, Description = expense.Method, Credit = Math.Round(paid, 2) }); if (expense.Amount > paid) lines.Add(new JournalLine { AccountId = accounts["2000"].Id, Description = "Supplier payable", Credit = Math.Round(expense.Amount - paid, 2) }); AddOrCorrect(db, latest.GetValueOrDefault(key), key, "Expense", expense.Description, expense.UpdatedAt, expense.Date, expense.Status, lines, demo);
        }
        await db.SaveChangesAsync();
    }

    static List<JournalLine> SaleLines(Sale sale, Dictionary<string, LedgerAccount> accounts)
    {
        var lines = sale.Payments.Select(payment => new JournalLine { AccountId = payment.Method.Equals("M-Pesa", StringComparison.OrdinalIgnoreCase) ? accounts["1010"].Id : accounts["1000"].Id, Description = payment.Method, Debit = Math.Round(payment.Amount, 2) }).ToList();
        var paid = sale.Payments.Sum(x => x.Amount); if (sale.Total > paid) lines.Add(new JournalLine { AccountId = accounts["1100"].Id, Description = "Customer receivable", Debit = Math.Round(sale.Total - paid, 2) }); lines.Add(new JournalLine { AccountId = accounts["4000"].Id, Description = "Sales revenue", Credit = Math.Round(sale.Total, 2) }); var cost = sale.Items.Sum(x => x.UnitCost * x.Quantity); if (cost > 0) { lines.Add(new JournalLine { AccountId = accounts["5000"].Id, Description = "Cost of goods sold", Debit = Math.Round(cost, 2) }); lines.Add(new JournalLine { AccountId = accounts["1200"].Id, Description = "Inventory issued", Credit = Math.Round(cost, 2) }); } return lines;
    }
    static void AddOrCorrect(AppDbContext db, JournalEntry? prior, string sourceKey, string sourceType, string memo, DateTimeOffset sourceUpdated, DateOnly date, string status, List<JournalLine> current, bool demo)
    {
        if (prior is null) { var entry = new JournalEntry { SourceType = sourceType, SourceId = sourceKey, Memo = memo, Date = date, Status = status, IsDemo = demo }; entry.Lines.AddRange(current); db.JournalEntries.Add(entry); return; }
        if (prior.CreatedAt >= sourceUpdated) return;
        var correctionKey = $"correction:{sourceKey}:{sourceUpdated.ToUnixTimeMilliseconds()}"; if (db.JournalEntries.Any(x => x.SourceId == correctionKey && x.IsDemo == demo)) return;
        var correction = new JournalEntry { SourceType = "Correction", SourceId = correctionKey, Memo = $"Correction · {memo}", Date = date, Status = "Posted", IsDemo = demo }; foreach (var line in prior.Lines) correction.Lines.Add(new JournalLine { AccountId = line.AccountId, Description = $"Reverse {line.Description}", Debit = line.Credit, Credit = line.Debit }); correction.Lines.AddRange(current); db.JournalEntries.Add(correction);
    }
}
