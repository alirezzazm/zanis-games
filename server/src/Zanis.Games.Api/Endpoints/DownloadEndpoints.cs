using QRCoder;
using Zanis.Games.Api.Auth;
using Zanis.Games.Api.Game;

namespace Zanis.Games.Api.Endpoints;

/// <summary>
/// Downloads of the two builds and their QR codes, all managed from the dashboard ("دانلود و QR").
/// The file links themselves are public, so a visitor can scan a printed QR code and install.
/// </summary>
public static class DownloadEndpoints
{
    public sealed record DownloadInfo(string FileName, long Size, string Url);

    public sealed record DownloadsResponse(
        string? Version,
        DateTimeOffset? PublishedAt,
        DateTimeOffset? CheckedAt,
        DownloadInfo? Android,
        DownloadInfo? Windows,
        DownloadProgress? InProgress);

    /// <summary>What a QR code may point at: only the game's own public pages and files.</summary>
    private static readonly Dictionary<string, string> QrTargets = new(StringComparer.OrdinalIgnoreCase)
    {
        ["android"] = "/download/android",
        ["windows"] = "/download/windows",
        ["play"] = "/play/",
    };

    public static void MapDownloadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/game/downloads", (Downloads downloads) => Describe(downloads.Current(), downloads.InProgress)).RequireCors(GameEndpoints.CorsPolicy);

        app.MapGet("/download/android", (Downloads downloads) =>
            Serve(downloads, Downloads.AndroidFile, set => set.Android, "application/vnd.android.package-archive"));
        app.MapGet("/download/windows", (Downloads downloads) =>
            Serve(downloads, Downloads.WindowsFile, set => set.Windows, "application/octet-stream"));

        app.MapGet("/api/game/qr", (string? target, string? format, HttpContext http, IConfiguration configuration) =>
        {
            if (!QrTargets.TryGetValue(target ?? "android", out var path))
            {
                return Results.NotFound(new ApiError("qr_target_unknown", "این مقصد برای QR تعریف نشده است."));
            }

            var url = PublicBase(http, configuration) + path;
            using var generator = new QRCodeGenerator();
            var data = generator.CreateQrCode(url, QRCodeGenerator.ECCLevel.Q);
            if (string.Equals(format, "png", StringComparison.OrdinalIgnoreCase))
            {
                var png = new PngByteQRCode(data).GetGraphic(20);
                return Results.File(png, "image/png", $"zanis-qr-{target ?? "android"}.png");
            }

            var svg = new SvgQRCode(data).GetGraphic(10);
            return Results.Text(svg, "image/svg+xml");
        });

        // Starts the check in the background (a large file may take many minutes); the dashboard
        // then follows inProgress in /api/game/downloads.
        app.MapPost("/api/admin/downloads/refresh", (Downloads downloads) =>
                Results.Ok(new { started = downloads.StartRefresh() }))
            .RequireAuthorization(AdminAuth.Policy)
            .AddEndpointFilter(AdminAuth.RequireCsrfHeader);
    }

    private static DownloadsResponse Describe(DownloadSet? set, DownloadProgress? inProgress) => new(
        set?.Version,
        set?.PublishedAt,
        set?.CheckedAt,
        set?.Android is { } android ? new DownloadInfo(android.FileName, android.Size, "/download/android") : null,
        set?.Windows is { } windows ? new DownloadInfo(windows.FileName, windows.Size, "/download/windows") : null,
        inProgress);

    private static IResult Serve(Downloads downloads, string fileName, Func<DownloadSet, DownloadFile?> pick, string contentType)
    {
        var set = downloads.Current();
        var file = set is null ? null : pick(set);
        var path = downloads.PathOf(fileName);
        if (file is null || path is null)
        {
            return Results.NotFound(new ApiError("download_not_ready", "فایل هنوز روی سرور نیامده است؛ چند دقیقهٔ دیگر دوباره امتحان کنید."));
        }

        // The versioned name from the release, so a saved file says which version it is.
        return Results.File(path, contentType, file.FileName, enableRangeProcessing: true);
    }

    /// <summary>The public address of the site: Zanis:PublicUrl, or the address this request came to.</summary>
    private static string PublicBase(HttpContext http, IConfiguration configuration) =>
        (configuration["Zanis:PublicUrl"] ?? $"{http.Request.Scheme}://{http.Request.Host}").TrimEnd('/');
}
