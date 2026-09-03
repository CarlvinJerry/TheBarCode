using System.Globalization;
using Microsoft.Data.Sqlite;
using Npgsql;
using NpgsqlTypes;
using TheBarcode.Api;
using Microsoft.EntityFrameworkCore;

if (args.Length < 4)
{
    Console.Error.WriteLine("Usage: TheBarcode.Migration.exe --sqlite <file> --postgres <connection-string>");
    return 2;
}

string? sqlitePath = null;
string? postgresConnection = null;
for (var i = 0; i < args.Length - 1; i++)
{
    if (args[i].Equals("--sqlite", StringComparison.OrdinalIgnoreCase)) sqlitePath = args[++i];
    else if (args[i].Equals("--postgres", StringComparison.OrdinalIgnoreCase)) postgresConnection = args[++i];
}
if (string.IsNullOrWhiteSpace(sqlitePath) || string.IsNullOrWhiteSpace(postgresConnection) || !File.Exists(sqlitePath))
{
    Console.Error.WriteLine("A readable SQLite source and PostgreSQL connection string are required.");
    return 2;
}

var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(postgresConnection).Options;
await using (var schema = new AppDbContext(options))
    await schema.Database.EnsureCreatedAsync();

var tables = new[]
{
    "organizations", "branches", "staff", "products", "customers", "suppliers", "terminals",
    "receipt_configurations", "insights_configurations", "ledger_accounts", "accounting_periods",
    "sales", "sale_items", "payments", "bill_revisions", "stock_movements",
    "product_import_batches", "product_import_lines", "expenses", "expense_payments",
    "recipes", "recipe_ingredients", "production_runs", "purchase_orders", "purchase_order_lines",
    "stock_lots", "stocktake_sessions", "stocktake_lines", "journal_entries", "journal_lines", "audit_events"
};

await using var source = new SqliteConnection($"Data Source={sqlitePath};Mode=ReadOnly");
await source.OpenAsync();
await using var destination = new NpgsqlConnection(postgresConnection);
await destination.OpenAsync();
await using var transaction = await destination.BeginTransactionAsync();
var copied = 0;
try
{
    foreach (var table in tables)
    {
        var sourceColumns = await Columns(source, table);
        if (sourceColumns.Count == 0) continue;
        var sourceCount = await SourceCount(source, table);
        var destinationColumns = await DestinationColumns(destination, transaction, table);
        var columns = sourceColumns.Keys.Where(x => destinationColumns.ContainsKey(x)).ToList();
        if (!columns.Contains("id", StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Table {table} has no id column and cannot be migrated safely.");

        var quotedColumns = string.Join(", ", columns.Select(Quote));
        var parameters = string.Join(", ", columns.Select((_, index) => $"@p{index}"));
        var updateColumns = columns.Where(x => !x.Equals("id", StringComparison.OrdinalIgnoreCase))
            .Select(x => $"{Quote(x)} = EXCLUDED.{Quote(x)}");
        var sql = $"INSERT INTO {Quote(table)} ({quotedColumns}) VALUES ({parameters}) ON CONFLICT ({Quote("id")}) DO UPDATE SET {string.Join(", ", updateColumns)};";

        await using var read = source.CreateCommand();
        read.CommandText = $"SELECT {quotedColumns} FROM {Quote(table)};";
        await using var rows = await read.ExecuteReaderAsync();
        while (await rows.ReadAsync())
        {
            await using var insert = destination.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = sql;
            for (var index = 0; index < columns.Count; index++)
            {
                var value = rows.GetValue(index);
                var parameter = insert.Parameters.Add($"p{index}", TypeFor(destinationColumns[columns[index]]));
                parameter.Value = ConvertValue(value, destinationColumns[columns[index]]) ?? DBNull.Value;
            }
            await insert.ExecuteNonQueryAsync();
            copied++;
        }
        var destinationCount = await DestinationCount(destination, transaction, table);
        if (destinationCount != sourceCount)
            throw new InvalidOperationException($"Row-count validation failed for {table}: source {sourceCount}, destination {destinationCount}.");
    }
    await transaction.CommitAsync();
    Console.WriteLine($"Migrated {copied} SQLite rows into PostgreSQL.");
    return 0;
}
catch
{
    await transaction.RollbackAsync();
    throw;
}

static async Task<Dictionary<string, string>> Columns(SqliteConnection connection, string table)
{
    await using var command = connection.CreateCommand();
    command.CommandText = $"PRAGMA table_info({Quote(table)});";
    await using var reader = await command.ExecuteReaderAsync();
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    while (await reader.ReadAsync()) result[reader.GetString(1)] = reader.GetString(2);
    return result;
}

static async Task<long> SourceCount(SqliteConnection connection, string table)
{
    await using var command = connection.CreateCommand();
    command.CommandText = $"SELECT COUNT(*) FROM {Quote(table)};";
    return (long)(await command.ExecuteScalarAsync() ?? 0L);
}

static async Task<Dictionary<string, string>> DestinationColumns(NpgsqlConnection connection, NpgsqlTransaction transaction, string table)
{
    await using var command = connection.CreateCommand();
    command.Transaction = transaction;
    command.CommandText = "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=@table";
    command.Parameters.AddWithValue("table", table);
    await using var reader = await command.ExecuteReaderAsync();
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    while (await reader.ReadAsync()) result[reader.GetString(0)] = reader.GetString(1);
    return result;
}

static async Task<long> DestinationCount(NpgsqlConnection connection, NpgsqlTransaction transaction, string table)
{
    await using var command = connection.CreateCommand();
    command.Transaction = transaction;
    command.CommandText = $"SELECT COUNT(*) FROM {Quote(table)};";
    return (long)(await command.ExecuteScalarAsync() ?? 0L);
}

static object? ConvertValue(object value, string type)
{
    if (value is DBNull) return null;
    var text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
    if (string.IsNullOrWhiteSpace(text) && type is "uuid" or "date" or "timestamp with time zone" or "timestamp without time zone") return null;
    return type switch
    {
        "boolean" => value is bool b ? b : Convert.ToInt64(value, CultureInfo.InvariantCulture) != 0,
        "uuid" => Guid.Parse(text),
        "date" => DateOnly.Parse(text, CultureInfo.InvariantCulture),
        "timestamp with time zone" or "timestamp without time zone" => DateTimeOffset.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal),
        "smallint" => Convert.ToInt16(value, CultureInfo.InvariantCulture),
        "integer" => Convert.ToInt32(value, CultureInfo.InvariantCulture),
        "bigint" => Convert.ToInt64(value, CultureInfo.InvariantCulture),
        "numeric" or "real" or "double precision" => decimal.Parse(text, CultureInfo.InvariantCulture),
        _ => value is string ? text : value
    };
}

static NpgsqlDbType TypeFor(string type) => type switch
{
    "boolean" => NpgsqlDbType.Boolean,
    "uuid" => NpgsqlDbType.Uuid,
    "date" => NpgsqlDbType.Date,
    "timestamp with time zone" => NpgsqlDbType.TimestampTz,
    "timestamp without time zone" => NpgsqlDbType.Timestamp,
    "smallint" => NpgsqlDbType.Smallint,
    "integer" => NpgsqlDbType.Integer,
    "bigint" => NpgsqlDbType.Bigint,
    "numeric" => NpgsqlDbType.Numeric,
    "real" => NpgsqlDbType.Real,
    "double precision" => NpgsqlDbType.Double,
    _ => NpgsqlDbType.Text
};

static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";
