using System.Text.Json;
using Zanis.Games.Api.Game;

namespace Zanis.Games.Api.Data;

public sealed record StoredSettings(GameSettings Settings, int Version, DateTimeOffset UpdatedAt, string? UpdatedBy);

/// <summary>The one row of game settings. Every save bumps the version the apps report with each score.</summary>
public sealed class SettingsStore(Database database, TimeProvider time)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public StoredSettings Get()
    {
        using var connection = database.Open();
        using var command = connection.Command("SELECT json, version, updated_at, updated_by FROM settings WHERE id = 1");
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return new StoredSettings(GameSettings.Default, 0, DateTimeOffset.UnixEpoch, null);
        }

        var settings = JsonSerializer.Deserialize<GameSettings>(reader.GetString(0), Json) ?? GameSettings.Default;
        return new StoredSettings(settings, reader.GetInt32(1), Sql.ParseIso(reader.GetString(2)), reader.NullableString(3));
    }

    /// <summary>
    /// Saves valid settings. With <paramref name="expectedVersion"/> the save fails (returns null) when
    /// someone else saved in between, so two admins cannot silently overwrite each other.
    /// </summary>
    public StoredSettings? Save(GameSettings settings, string updatedBy, int? expectedVersion)
    {
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        using var read = connection.Command("SELECT version FROM settings WHERE id = 1");
        read.Transaction = transaction;
        var current = read.ExecuteScalar() is long version ? (int)version : 0;
        if (expectedVersion is { } expected && expected != current)
        {
            return null;
        }

        var now = time.GetUtcNow();
        using var write = connection.Command(
            """
            INSERT INTO settings (id, json, version, updated_at, updated_by) VALUES (1, $json, $version, $at, $by)
            ON CONFLICT (id) DO UPDATE SET json = excluded.json, version = excluded.version,
                updated_at = excluded.updated_at, updated_by = excluded.updated_by
            """,
            ("$json", JsonSerializer.Serialize(settings, Json)),
            ("$version", current + 1),
            ("$at", Sql.Iso(now)),
            ("$by", updatedBy));
        write.Transaction = transaction;
        write.ExecuteNonQuery();
        transaction.Commit();
        return new StoredSettings(settings, current + 1, now, updatedBy);
    }
}
