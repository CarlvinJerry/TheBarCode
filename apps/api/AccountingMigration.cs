using Microsoft.EntityFrameworkCore;
namespace TheBarcode.Api;
public static class AccountingMigration
{
 public static async Task Apply(AppDbContext db)
 {
  var sql=db.Database.IsSqlite()?new[]{
   "CREATE TABLE IF NOT EXISTS ledger_accounts (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, system INTEGER NOT NULL, active INTEGER NOT NULL, is_demo INTEGER NOT NULL)",
   "CREATE UNIQUE INDEX IF NOT EXISTS ix_ledger_accounts_code_demo ON ledger_accounts(code,is_demo)",
   "CREATE TABLE IF NOT EXISTS journal_entries (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, date TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NULL, memo TEXT NOT NULL, status TEXT NOT NULL, is_demo INTEGER NOT NULL)",
   "CREATE INDEX IF NOT EXISTS ix_journal_entries_date_demo ON journal_entries(date,is_demo)",
   "CREATE TABLE IF NOT EXISTS journal_lines (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, journal_entry_id TEXT NOT NULL, account_id TEXT NOT NULL, description TEXT NOT NULL, debit TEXT NOT NULL, credit TEXT NOT NULL)",
   "CREATE INDEX IF NOT EXISTS ix_journal_lines_entry ON journal_lines(journal_entry_id)",
   "CREATE TABLE IF NOT EXISTS accounting_periods (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, locked INTEGER NOT NULL, is_demo INTEGER NOT NULL)"
  }:new[]{
   "CREATE TABLE IF NOT EXISTS ledger_accounts (id uuid PRIMARY KEY,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,code text NOT NULL,name text NOT NULL,type text NOT NULL,system boolean NOT NULL,active boolean NOT NULL,is_demo boolean NOT NULL)",
   "CREATE UNIQUE INDEX IF NOT EXISTS ix_ledger_accounts_code_demo ON ledger_accounts(code,is_demo)",
   "CREATE TABLE IF NOT EXISTS journal_entries (id uuid PRIMARY KEY,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,date date NOT NULL,source_type text NOT NULL,source_id text NULL,memo text NOT NULL,status text NOT NULL,is_demo boolean NOT NULL)",
   "CREATE INDEX IF NOT EXISTS ix_journal_entries_date_demo ON journal_entries(date,is_demo)",
   "CREATE TABLE IF NOT EXISTS journal_lines (id uuid PRIMARY KEY,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,account_id uuid NOT NULL,description text NOT NULL,debit numeric(18,2) NOT NULL,credit numeric(18,2) NOT NULL)",
   "CREATE INDEX IF NOT EXISTS ix_journal_lines_entry ON journal_lines(journal_entry_id)",
   "CREATE TABLE IF NOT EXISTS accounting_periods (id uuid PRIMARY KEY,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,name text NOT NULL,start date NOT NULL,"+
   "\"end\" date NOT NULL,locked boolean NOT NULL,is_demo boolean NOT NULL)"};
  foreach(var statement in sql)await db.Database.ExecuteSqlRawAsync(statement);
  var accounts=new[]{("1000","Cash","Asset"),("1010","M-Pesa","Asset"),("1100","Accounts receivable","Asset"),("1200","Inventory","Asset"),("2000","Accounts payable","Liability"),("2100","Tax payable","Liability"),("3000","Owner equity","Equity"),("4000","Sales revenue","Revenue"),("5000","Cost of goods sold","Expense"),("6000","Operating expenses","Expense")};
  foreach(var demo in new[]{false,true})if(!await db.LedgerAccounts.AnyAsync(x=>x.IsDemo==demo))foreach(var a in accounts)db.LedgerAccounts.Add(new LedgerAccount{Code=a.Item1,Name=a.Item2,Type=a.Item3,System=true,IsDemo=demo});
  await db.SaveChangesAsync();
 }
}
