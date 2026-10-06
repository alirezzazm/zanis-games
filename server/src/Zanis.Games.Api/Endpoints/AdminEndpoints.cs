using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Zanis.Games.Api.Auth;
using Zanis.Games.Api.Data;
using Zanis.Games.Api.Game;

namespace Zanis.Games.Api.Endpoints;

/// <summary>The dashboard API: sign-in, game settings, scores, booth computers and the account.</summary>
public static class AdminEndpoints
{
    public sealed record LoginRequest(string? Username, string? Password);

    public sealed record PasswordRequest(string? CurrentPassword, string? NewPassword);

    public sealed record SettingsRequest(GameSettings? Settings, int? ExpectedVersion);

    public sealed record KioskRequest(string? Name);

    public sealed record ClearRequest(string? Confirm);

    /// <summary>The phrase the dashboard asks the admin to type before deleting every score.</summary>
    public const string ClearPhrase = "پاک شود";

    private const int MaxPageSize = 200;

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var open = app.MapGroup("/api/admin").AddEndpointFilter(AdminAuth.RequireCsrfHeader);
        open.MapPost("/login", Login).RequireRateLimiting("login");
        open.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(AdminAuth.Scheme);
            return Results.NoContent();
        });

        var admin = app.MapGroup("/api/admin")
            .RequireAuthorization(AdminAuth.Policy)
            .AddEndpointFilter(AdminAuth.RequireCsrfHeader);

        admin.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { username = user.Identity!.Name }));
        admin.MapPut("/password", ChangePassword).RequireRateLimiting("login");

        admin.MapGet("/settings", (SettingsStore settings) =>
        {
            var stored = settings.Get();
            return Results.Ok(new
            {
                stored.Version,
                stored.UpdatedAt,
                stored.UpdatedBy,
                stored.Settings,
                Defaults = GameSettings.Default,
            });
        });
        admin.MapPut("/settings", SaveSettings);

        admin.MapGet("/summary", (ScoreStore scores, TehranClock clock) => Results.Ok(scores.Summary(clock.StartOfToday())));
        admin.MapGet("/leaderboard", (bool? today, int? limit, ScoreStore scores, TehranClock clock) =>
            Results.Ok(scores.Leaderboard(today == false ? DateTimeOffset.UnixEpoch : clock.StartOfToday(), Math.Clamp(limit ?? 50, 1, 500))));
        admin.MapGet("/scores", (string? search, bool? today, int? page, int? pageSize, ScoreStore scores, TehranClock clock) =>
        {
            var size = Math.Clamp(pageSize ?? 50, 1, MaxPageSize);
            var number = Math.Max(1, page ?? 1);
            return Results.Ok(scores.Page(search, today == true ? clock.StartOfToday() : null, (number - 1) * size, size));
        });
        admin.MapGet("/scores.csv", (bool? today, ScoreStore scores, TehranClock clock) =>
            Results.File(ScoresCsv(scores.Page(null, today == true ? clock.StartOfToday() : null, 0, int.MaxValue).Items),
                "text/csv; charset=utf-8",
                $"zanis-scores-{clock.Now.ToOffset(TimeSpan.FromMinutes(210)):yyyy-MM-dd-HHmm}.csv"));
        admin.MapDelete("/scores/{id:long}", (long id, ScoreStore scores) =>
            scores.Delete(id) ? Results.NoContent() : Results.NotFound(new ApiError("score_not_found", "این امتیاز پیدا نشد.")));
        admin.MapPost("/scores/clear", (ClearRequest request, ScoreStore scores) =>
            request.Confirm?.Trim() == ClearPhrase
                ? Results.Ok(new { deleted = scores.DeleteAll() })
                : GameEndpoints.Invalid(new() { ["confirm"] = $"برای پاک کردن، عبارت «{ClearPhrase}» را بنویسید." }));

        admin.MapGet("/kiosks", (KioskStore kiosks) => Results.Ok(kiosks.List()));
        admin.MapPost("/kiosks", (KioskRequest request, KioskStore kiosks) =>
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length is < 2 or > 40)
            {
                return GameEndpoints.Invalid(new() { ["name"] = "نام دستگاه باید بین ۲ تا ۴۰ حرف باشد." });
            }

            var (kiosk, key) = kiosks.Create(name);
            return Results.Json(new { kiosk, key }, statusCode: StatusCodes.Status201Created);
        });
        admin.MapDelete("/kiosks/{id:long}", (long id, KioskStore kiosks) =>
            kiosks.Revoke(id) ? Results.NoContent() : Results.NotFound(new ApiError("kiosk_not_found", "این دستگاه پیدا نشد یا قبلاً باطل شده است.")));
    }

    private static async Task<IResult> Login(LoginRequest request, HttpContext http, AdminStore admins)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var admin = username.Length > 0 ? admins.Find(username) : null;
        if (admin is null)
        {
            PasswordHasher.BurnTime(password);
        }

        if (admin is null || !PasswordHasher.Verify(password, admin.PasswordHash))
        {
            return Results.Json(new ApiError("invalid_credentials", "نام کاربری یا رمز درست نیست."), statusCode: StatusCodes.Status401Unauthorized);
        }

        await AdminAuth.SignInAsync(http, admin);
        return Results.Ok(new { username = admin.Username });
    }

    private static async Task<IResult> ChangePassword(PasswordRequest request, HttpContext http, AdminStore admins)
    {
        var admin = AdminAuth.AdminId(http.User) is { } id ? admins.Find(id) : null;
        if (admin is null)
        {
            return Results.Unauthorized();
        }

        if (!PasswordHasher.Verify(request.CurrentPassword ?? string.Empty, admin.PasswordHash))
        {
            return GameEndpoints.Invalid(new() { ["currentPassword"] = "رمز فعلی درست نیست." });
        }

        var newPassword = request.NewPassword ?? string.Empty;
        if (newPassword.Length < 10)
        {
            return GameEndpoints.Invalid(new() { ["newPassword"] = "رمز جدید باید دست‌کم ۱۰ نویسه باشد." });
        }

        var stamp = admins.ChangePassword(admin.Id, newPassword);
        // Other sessions end (their stamp no longer matches); this one continues with the new stamp.
        await AdminAuth.SignInAsync(http, admin with { Stamp = stamp });
        return Results.NoContent();
    }

    private static IResult SaveSettings(SettingsRequest request, ClaimsPrincipal user, SettingsStore settings)
    {
        if (request.Settings is null)
        {
            return GameEndpoints.Invalid(new() { ["settings"] = "تنظیمات فرستاده نشده است." });
        }

        var errors = request.Settings.Validate();
        if (errors.Count > 0)
        {
            return GameEndpoints.Invalid(errors);
        }

        var saved = settings.Save(request.Settings, user.Identity!.Name!, request.ExpectedVersion);
        if (saved is null)
        {
            return Results.Conflict(new ApiError(
                "settings_changed",
                "تنظیمات را کس دیگری در این فاصله ذخیره کرده است. صفحه را تازه کنید و دوباره تغییر دهید."));
        }

        return Results.Ok(new { saved.Version, saved.UpdatedAt, saved.UpdatedBy, saved.Settings });
    }

    private static byte[] ScoresCsv(IEnumerable<ScoreRow> rows)
    {
        static string Cell(string text) => $"\"{text.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
        var tehran = TimeSpan.FromMinutes(210);
        var csv = new StringBuilder("name,phone,score,hits,red_taps,wrong_taps,missed,settings_version,kiosk,played_at_tehran\n");
        foreach (var row in rows)
        {
            csv.Append(Cell(row.Name)).Append(',')
                .Append(row.Phone).Append(',')
                .Append(row.Score.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.Hits.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.RedTaps.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.WrongTaps.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.Missed.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(row.SettingsVersion.ToString(CultureInfo.InvariantCulture)).Append(',')
                .Append(Cell(row.Kiosk ?? string.Empty)).Append(',')
                .Append(row.PlayedAt.ToOffset(tehran).ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture))
                .Append('\n');
        }

        // The BOM lets Excel open the Persian names correctly.
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.ToString())];
    }
}
