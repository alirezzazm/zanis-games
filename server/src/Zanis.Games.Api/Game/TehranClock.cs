namespace Zanis.Games.Api.Game;

/// <summary>"Today" of the exhibition, in Tehran time.</summary>
public sealed class TehranClock(TimeProvider time)
{
    // Iran has had no daylight saving time since 2022; the fixed offset is the fallback when the
    // container has no time zone database.
    private static readonly TimeZoneInfo Zone = FindZone();

    public DateTimeOffset Now => time.GetUtcNow();

    /// <summary>Start of the current Tehran day, in UTC.</summary>
    public DateTimeOffset StartOfToday()
    {
        var local = TimeZoneInfo.ConvertTime(Now, Zone);
        var midnight = new DateTimeOffset(local.Date, local.Offset);
        return midnight.ToUniversalTime();
    }

    private static TimeZoneInfo FindZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Tehran");
        }
        catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.CreateCustomTimeZone("Tehran", TimeSpan.FromMinutes(210), "Tehran", "Tehran");
        }
    }
}
