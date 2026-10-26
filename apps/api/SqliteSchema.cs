using System.Data;
using Microsoft.EntityFrameworkCore;

namespace TheBarcode.Api;

public static class SqliteSchema
{
    public static async Task<bool> AddColumnIfMissing(AppDbContext db, string statement)
    {
        var parts = statement.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 6 || parts[0] != "ALTER" || parts[1] != "TABLE" || parts[3] != "ADD" || parts[4] != "COLUMN")
            throw new ArgumentException("Expected a trusted ALTER TABLE ... ADD COLUMN statement.", nameof(statement));
        var table = parts[2];
        var column = parts[5];
        if (!table.All(c => char.IsAsciiLetterOrDigit(c) || c == '_') ||
            !column.All(c => char.IsAsciiLetterOrDigit(c) || c == '_'))
            throw new ArgumentException("Invalid SQLite schema identifier.", nameof(statement));

        var connection = db.Database.GetDbConnection();
        var close = connection.State != ConnectionState.Open;
        if (close) await connection.OpenAsync();
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"PRAGMA table_info(\"{table}\")";
            await using var reader = await command.ExecuteReaderAsync();
            var foundTable = false;
            while (await reader.ReadAsync())
            {
                foundTable = true;
                if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase)) return false;
            }
            // OperationsMigration can run before an optional module creates
            // its table. ModularOperationsMigration repeats that column after
            // creating the table; no failure or data rewrite is required here.
            if (!foundTable) return false;
        }
        finally { if (close) await connection.CloseAsync(); }

        await db.Database.ExecuteSqlRawAsync(statement);
        return true;
    }
}
