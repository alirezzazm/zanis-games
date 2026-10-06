using Microsoft.Data.Sqlite;

namespace Zanis.Games.Api.Data;

public sealed record NewScore(
    string ClientId,
    long? KioskId,
    string Name,
    string Phone,
    int Score,
    int Hits,
    int RedTaps,
    int WrongTaps,
    int Missed,
    int SettingsVersion,
    DateTimeOffset PlayedAt);

public sealed record ScoreRow(
    long Id,
    string Name,
    string Phone,
    int Score,
    int Hits,
    int RedTaps,
    int WrongTaps,
    int Missed,
    int SettingsVersion,
    string? Kiosk,
    DateTimeOffset PlayedAt);

/// <summary>A player's best round in a period; ties go to whoever reached the score first.</summary>
public sealed record BestRow(string Name, string Phone, int Score, int Plays, DateTimeOffset PlayedAt);

public sealed record ScorePage(int Total, IReadOnlyList<ScoreRow> Items);

public sealed record Summary(int Plays, int Players, int PlaysToday, int PlayersToday, int? BestToday, int? BestEver);

/// <summary>Tournament rounds sent by the Windows game.</summary>
public sealed class ScoreStore(Database database, TimeProvider time)
{
    /// <summary>Stores a round once per client id; false when the same round was already stored.</summary>
    public bool Add(NewScore score)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            """
            INSERT INTO scores (client_id, kiosk_id, name, phone, score, hits, red_taps, wrong_taps, missed,
                                settings_version, played_at, received_at)
            VALUES ($client, $kiosk, $name, $phone, $score, $hits, $red, $wrong, $missed, $version, $played, $received)
            ON CONFLICT (client_id) DO NOTHING
            """,
            ("$client", score.ClientId),
            ("$kiosk", score.KioskId),
            ("$name", score.Name),
            ("$phone", score.Phone),
            ("$score", score.Score),
            ("$hits", score.Hits),
            ("$red", score.RedTaps),
            ("$wrong", score.WrongTaps),
            ("$missed", score.Missed),
            ("$version", score.SettingsVersion),
            ("$played", Sql.Iso(score.PlayedAt)),
            ("$received", Sql.Iso(time.GetUtcNow())));
        return command.ExecuteNonQuery() == 1;
    }

    public int PlaysOf(string phone)
    {
        using var connection = database.Open();
        using var command = connection.Command("SELECT COUNT(*) FROM scores WHERE phone = $phone", ("$phone", phone));
        return Convert.ToInt32(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>The player's best score since <paramref name="from"/> and their rank among all players (ties share a rank).</summary>
    public (int? Best, int? Rank) RankOf(string phone, DateTimeOffset from)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            """
            WITH best AS (SELECT phone, MAX(score) AS best FROM scores WHERE played_at >= $from GROUP BY phone)
            SELECT mine.best, (SELECT COUNT(*) FROM best WHERE best.best > mine.best) + 1
            FROM best AS mine WHERE mine.phone = $phone
            """,
            ("$from", Sql.Iso(from)),
            ("$phone", phone));
        using var reader = command.ExecuteReader();
        return reader.Read() ? (reader.GetInt32(0), reader.GetInt32(1)) : (null, null);
    }

    /// <summary>Best round per player since <paramref name="from"/>, highest first.</summary>
    public IReadOnlyList<BestRow> Leaderboard(DateTimeOffset from, int limit)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            """
            WITH ranked AS (
                SELECT name, phone, score, played_at,
                       ROW_NUMBER() OVER (PARTITION BY phone ORDER BY score DESC, played_at ASC) AS position,
                       COUNT(*) OVER (PARTITION BY phone) AS plays
                FROM scores WHERE played_at >= $from)
            SELECT name, phone, score, plays, played_at FROM ranked WHERE position = 1
            ORDER BY score DESC, played_at ASC LIMIT $limit
            """,
            ("$from", Sql.Iso(from)),
            ("$limit", limit));
        using var reader = command.ExecuteReader();
        var rows = new List<BestRow>();
        while (reader.Read())
        {
            rows.Add(new BestRow(reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetInt32(3), Sql.ParseIso(reader.GetString(4))));
        }

        return rows;
    }

    /// <summary>Latest rounds, newest first.</summary>
    public IReadOnlyList<ScoreRow> Recent(int limit) => Page(null, null, 0, limit).Items;

    public ScorePage Page(string? search, DateTimeOffset? from, int skip, int take)
    {
        var where = new List<string>();
        var parameters = new List<(string, object?)> { ("$skip", skip), ("$take", take) };
        if (!string.IsNullOrWhiteSpace(search))
        {
            where.Add("(s.name LIKE $search ESCAPE '\\' OR s.phone LIKE $search ESCAPE '\\')");
            var escaped = search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            parameters.Add(("$search", $"%{escaped}%"));
        }

        if (from is { } since)
        {
            where.Add("s.played_at >= $from");
            parameters.Add(("$from", Sql.Iso(since)));
        }

        var filter = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : string.Empty;
        using var connection = database.Open();
        int total;
        using (var count = connection.Command($"SELECT COUNT(*) FROM scores AS s {filter}", [.. parameters]))
        {
            total = Convert.ToInt32(count.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
        }

        using var command = connection.Command(
            $"""
            SELECT s.id, s.name, s.phone, s.score, s.hits, s.red_taps, s.wrong_taps, s.missed, s.settings_version,
                   k.name, s.played_at
            FROM scores AS s LEFT JOIN kiosks AS k ON k.id = s.kiosk_id
            {filter}
            ORDER BY s.played_at DESC, s.id DESC LIMIT $take OFFSET $skip
            """,
            [.. parameters]);
        return new ScorePage(total, ReadRows(command));
    }

    public Summary Summary(DateTimeOffset startOfToday)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            """
            SELECT COUNT(*), COUNT(DISTINCT phone),
                   SUM(played_at >= $today), COUNT(DISTINCT CASE WHEN played_at >= $today THEN phone END),
                   MAX(CASE WHEN played_at >= $today THEN score END), MAX(score)
            FROM scores
            """,
            ("$today", Sql.Iso(startOfToday)));
        using var reader = command.ExecuteReader();
        reader.Read();
        return new Summary(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.IsDBNull(2) ? 0 : reader.GetInt32(2),
            reader.GetInt32(3),
            reader.IsDBNull(4) ? null : reader.GetInt32(4),
            reader.IsDBNull(5) ? null : reader.GetInt32(5));
    }

    public bool Delete(long id)
    {
        using var connection = database.Open();
        using var command = connection.Command("DELETE FROM scores WHERE id = $id", ("$id", id));
        return command.ExecuteNonQuery() == 1;
    }

    public int DeleteAll()
    {
        using var connection = database.Open();
        using var command = connection.Command("DELETE FROM scores");
        return command.ExecuteNonQuery();
    }

    private static List<ScoreRow> ReadRows(SqliteCommand command)
    {
        using var reader = command.ExecuteReader();
        var rows = new List<ScoreRow>();
        while (reader.Read())
        {
            rows.Add(new ScoreRow(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetInt32(5),
                reader.GetInt32(6),
                reader.GetInt32(7),
                reader.GetInt32(8),
                reader.NullableString(9),
                Sql.ParseIso(reader.GetString(10))));
        }

        return rows;
    }
}
