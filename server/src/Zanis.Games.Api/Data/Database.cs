using System.Globalization;
using Microsoft.Data.Sqlite;

namespace Zanis.Games.Api.Data;

/// <summary>
/// The service's own SQLite file (one booth needs no database server). Schema changes are numbered
/// steps applied once each, tracked in PRAGMA user_version.
/// </summary>
public sealed class Database(string connectionString)
{
    private static readonly string[] Migrations =
    [
        """
        CREATE TABLE settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json TEXT NOT NULL,
            version INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT
        );
        CREATE TABLE admins (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            stamp TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE kiosks (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen_at TEXT,
            revoked_at TEXT
        );
        CREATE TABLE scores (
            id INTEGER PRIMARY KEY,
            client_id TEXT NOT NULL UNIQUE,
            kiosk_id INTEGER REFERENCES kiosks (id),
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            score INTEGER NOT NULL,
            hits INTEGER NOT NULL,
            red_taps INTEGER NOT NULL,
            wrong_taps INTEGER NOT NULL,
            missed INTEGER NOT NULL,
            settings_version INTEGER NOT NULL,
            played_at TEXT NOT NULL,
            received_at TEXT NOT NULL
        );
        CREATE INDEX ix_scores_phone ON scores (phone, score DESC);
        CREATE INDEX ix_scores_played_at ON scores (played_at);
        """,
    ];

    public SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
        pragma.ExecuteNonQuery();
        return connection;
    }

    public void Migrate()
    {
        using var connection = Open();
        using (var wal = connection.CreateCommand())
        {
            wal.CommandText = "PRAGMA journal_mode = WAL;";
            wal.ExecuteNonQuery();
        }

        var current = Convert.ToInt32(Scalar(connection, "PRAGMA user_version;"), CultureInfo.InvariantCulture);
        for (var step = current; step < Migrations.Length; step++)
        {
            using var transaction = connection.BeginTransaction();
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"{Migrations[step]}\nPRAGMA user_version = {step + 1};";
            command.ExecuteNonQuery();
            transaction.Commit();
        }
    }

    private static object? Scalar(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }
}

internal static class Sql
{
    /// <summary>UTC timestamps are stored as fixed-width ISO text, so text order is time order.</summary>
    public static string Iso(DateTimeOffset time) =>
        time.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    public static DateTimeOffset ParseIso(string text) =>
        DateTimeOffset.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);

    public static SqliteCommand Command(this SqliteConnection connection, string sql, params (string Name, object? Value)[] parameters)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return command;
    }

    public static string? NullableString(this SqliteDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
}
