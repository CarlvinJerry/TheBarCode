using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class AccountingQueries
{
    public static async Task<IReadOnlyList<object>> TrialBalance(AppDbContext db, bool demo, DateOnly? to)
    {
        // Group in the database so the trial balance does not transfer every
        // historical journal line to the API process on each refresh.
        var totals = await db.JournalLines.AsNoTracking()
            .Join(db.JournalEntries.AsNoTracking().Where(x => x.IsDemo == demo
                && x.Status != "Superseded" && (to == null || x.Date <= to)),
                line => line.JournalEntryId, entry => entry.Id, (line, _) => line)
            .GroupBy(x => x.AccountId)
            .Select(group => new { AccountId = group.Key,
                Debit = group.Sum(x => x.Debit), Credit = group.Sum(x => x.Credit) })
            .ToDictionaryAsync(x => x.AccountId);
        var accounts = await db.LedgerAccounts.AsNoTracking()
            .Where(x => x.IsDemo == demo && x.Active)
            .OrderBy(x => x.Code).ToListAsync();
        return accounts.Select(account => new {
            account.Code, account.Name, account.Type,
            debit = totals.GetValueOrDefault(account.Id)?.Debit ?? 0m,
            credit = totals.GetValueOrDefault(account.Id)?.Credit ?? 0m
        }).Where(x => x.debit != 0 || x.credit != 0).Cast<object>().ToList();
    }
}
