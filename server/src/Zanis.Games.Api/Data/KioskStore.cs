using System.Security.Cryptography;
using System.Text;

namespace Zanis.Games.Api.Data;

public sealed record Kiosk(long Id, string Name, string KeyPrefix, DateTimeOffset CreatedAt, DateTimeOffset? LastSeenAt, DateTimeOffset? RevokedAt);

/// <summary>
/// Booth computers allowed to send scores. Each gets a random key, shown once in the dashboard and
/// typed into the game's operator panel; only its SHA-256 is stored.
/// </summary>
public sealed class KioskStore(Database database, TimeProvider time)
{
    private const string KeyPrefix = "zk_";

    public (Kiosk Kiosk, string Key) Create(string name)
    {
        var key = KeyPrefix + Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var now = time.GetUtcNow();
        using var connection = database.Open();
        using var command = connection.Command(
            "INSERT INTO kiosks (name, key_hash, key_prefix, created_at) VALUES ($name, $hash, $prefix, $at) RETURNING id",
            ("$name", name),
            ("$hash", Hash(key)),
            ("$prefix", key[..7]),
            ("$at", Sql.Iso(now)));
        var id = (long)command.ExecuteScalar()!;
        return (new Kiosk(id, name, key[..7], now, null, null), key);
    }

    /// <summary>The active kiosk owning <paramref name="key"/>, or null; records when it was last seen.</summary>
    public Kiosk? Authenticate(string? key)
    {
        if (string.IsNullOrEmpty(key) || !key.StartsWith(KeyPrefix, StringComparison.Ordinal) || key.Length > 100)
        {
            return null;
        }

        using var connection = database.Open();
        using var command = connection.Command(
            """
            UPDATE kiosks SET last_seen_at = $now WHERE key_hash = $hash AND revoked_at IS NULL
            RETURNING id, name, key_prefix, created_at, last_seen_at, revoked_at
            """,
            ("$now", Sql.Iso(time.GetUtcNow())),
            ("$hash", Hash(key)));
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    public IReadOnlyList<Kiosk> List()
    {
        using var connection = database.Open();
        using var command = connection.Command(
            "SELECT id, name, key_prefix, created_at, last_seen_at, revoked_at FROM kiosks ORDER BY revoked_at IS NOT NULL, id DESC");
        using var reader = command.ExecuteReader();
        var kiosks = new List<Kiosk>();
        while (reader.Read())
        {
            kiosks.Add(Read(reader));
        }

        return kiosks;
    }

    /// <summary>Revokes a key; its scores stay. False when there is no such active kiosk.</summary>
    public bool Revoke(long id)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            "UPDATE kiosks SET revoked_at = $now WHERE id = $id AND revoked_at IS NULL",
            ("$now", Sql.Iso(time.GetUtcNow())),
            ("$id", id));
        return command.ExecuteNonQuery() == 1;
    }

    private static Kiosk Read(Microsoft.Data.Sqlite.SqliteDataReader reader)
    {
        DateTimeOffset? Optional(int ordinal) => reader.IsDBNull(ordinal) ? null : Sql.ParseIso(reader.GetString(ordinal));
        return new Kiosk(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), Sql.ParseIso(reader.GetString(3)), Optional(4), Optional(5));
    }

    private static string Hash(string key) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
}
