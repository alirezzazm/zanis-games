using Zanis.Games.Api.Auth;
using Zanis.Games.Api.Data;
using Zanis.Games.Api.Game;

namespace Zanis.Games.Api.Endpoints;

/// <summary>
/// Calls of the apps. /api/game is public (settings and the scrolling bar, no personal data);
/// /api/kiosk needs the key of a booth computer in the X-Kiosk-Key header.
/// </summary>
public static class GameEndpoints
{
    public const string CorsPolicy = "apps";
    public const string KioskHeader = "X-Kiosk-Key";
    private const string KioskItem = "kiosk";

    public sealed record SettingsResponse(int Version, DateTimeOffset UpdatedAt, GameSettings Settings);

    public sealed record TickerEntry(string Name, int Score);

    public sealed record TickerResponse(IReadOnlyList<TickerEntry> Recent, IReadOnlyList<TickerEntry> Top, bool TopToday);

    public sealed record ScoreRequest(
        string? ClientId,
        string? Name,
        string? Phone,
        int Score,
        int Hits,
        int RedTaps,
        int WrongTaps,
        int Missed,
        int SettingsVersion,
        DateTimeOffset? PlayedAt);

    public sealed record ScoreReceipt(bool Stored, int? Rank, int? Best, int Plays);

    public static void MapGameEndpoints(this IEndpointRouteBuilder app)
    {
        var game = app.MapGroup("/api/game").RequireCors(CorsPolicy);
        game.MapGet("/settings", (SettingsStore settings) =>
        {
            var stored = settings.Get();
            return new SettingsResponse(stored.Version, stored.UpdatedAt, stored.Settings);
        });
        game.MapGet("/ticker", (SettingsStore settings, ScoreStore scores, TehranClock clock) =>
        {
            var current = settings.Get().Settings;
            var from = current.TickerTopToday ? clock.StartOfToday() : DateTimeOffset.UnixEpoch;
            IReadOnlyList<BestRow> top = current.TickerTop == 0 ? [] : scores.Leaderboard(from, current.TickerTop);
            IReadOnlyList<ScoreRow> recent = current.TickerRecent == 0 ? [] : scores.Recent(current.TickerRecent);
            return new TickerResponse(
                [.. recent.Select(row => new TickerEntry(Players.ShortName(row.Name), row.Score))],
                [.. top.Select(row => new TickerEntry(Players.ShortName(row.Name), row.Score))],
                current.TickerTopToday);
        });

        var kiosk = app.MapGroup("/api/kiosk")
            .RequireCors(CorsPolicy)
            .RequireRateLimiting("kiosk")
            .AddEndpointFilter(RequireKiosk);
        kiosk.MapGet("/ping", (HttpContext http) => Results.Ok(new { kiosk = CurrentKiosk(http).Name }));
        kiosk.MapGet("/plays", (string? phone, ScoreStore scores) =>
            Players.NormalizePhone(phone) is { } normalized
                ? Results.Ok(new { plays = scores.PlaysOf(normalized) })
                : Invalid(new() { ["phone"] = "شمارهٔ موبایل درست نیست." }));
        kiosk.MapPost("/scores", SubmitScore);
    }

    private static IResult SubmitScore(ScoreRequest request, HttpContext http, ScoreStore scores, SettingsStore settings, TehranClock clock)
    {
        var errors = new Dictionary<string, string>();
        var clientId = request.ClientId?.Trim();
        if (string.IsNullOrEmpty(clientId) || clientId.Length > 64)
        {
            errors["clientId"] = "شناسهٔ دور لازم است.";
        }

        var name = Players.CleanName(request.Name);
        if (name is null)
        {
            errors["name"] = "نام باید بین ۲ تا ۴۰ حرف باشد.";
        }

        var phone = Players.NormalizePhone(request.Phone);
        if (phone is null)
        {
            errors["phone"] = "شمارهٔ موبایل درست نیست.";
        }

        if (request.Score is < 0 or > 100_000)
        {
            errors["score"] = "امتیاز خارج از محدوده است.";
        }

        foreach (var (field, value) in new[] { ("hits", request.Hits), ("redTaps", request.RedTaps), ("wrongTaps", request.WrongTaps), ("missed", request.Missed) })
        {
            if (value is < 0 or > 10_000)
            {
                errors[field] = "عدد خارج از محدوده است.";
            }
        }

        if (request.SettingsVersion < 0)
        {
            errors["settingsVersion"] = "نسخهٔ تنظیمات درست نیست.";
        }

        if (errors.Count > 0)
        {
            return Invalid(errors);
        }

        // Rounds played offline arrive late; a clock far off (wrong PC date) falls back to the arrival time.
        var now = clock.Now;
        var playedAt = request.PlayedAt is { } at && at <= now.AddMinutes(10) && at >= now.AddDays(-30) ? at : now;
        var stored = scores.Add(new NewScore(
            clientId!, CurrentKiosk(http).Id, name!, phone!, request.Score, request.Hits, request.RedTaps,
            request.WrongTaps, request.Missed, request.SettingsVersion, playedAt));

        var from = settings.Get().Settings.TickerTopToday ? clock.StartOfToday() : DateTimeOffset.UnixEpoch;
        var (best, rank) = scores.RankOf(phone!, from);
        var receipt = new ScoreReceipt(stored, rank, best, scores.PlaysOf(phone!));
        return stored ? Results.Json(receipt, statusCode: StatusCodes.Status201Created) : Results.Ok(receipt);
    }

    private static async ValueTask<object?> RequireKiosk(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var kiosks = http.RequestServices.GetRequiredService<KioskStore>();
        if (kiosks.Authenticate(http.Request.Headers[KioskHeader]) is not { } kiosk)
        {
            return Results.Json(
                new ApiError("kiosk_key_invalid", "کلید دستگاه معتبر نیست؛ کلید تازه را از داشبورد بگیرید."),
                statusCode: StatusCodes.Status401Unauthorized);
        }

        http.Items[KioskItem] = kiosk;
        return await next(context);
    }

    private static Kiosk CurrentKiosk(HttpContext http) => (Kiosk)http.Items[KioskItem]!;

    internal static IResult Invalid(Dictionary<string, string> errors) =>
        Results.BadRequest(new ApiError("validation_failed", "بعضی مقدارها درست نیست.", errors));
}
