using System.Threading.RateLimiting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Options;
using Zanis.Games.Api.Auth;
using Zanis.Games.Api.Data;
using Zanis.Games.Api.Endpoints;
using Zanis.Games.Api.Game;

var builder = WebApplication.CreateBuilder(args);

// Everything the service keeps lives in one folder (a Docker volume in production): the SQLite file
// and the keys that sign the dashboard cookie. Settings are read when the services are first used,
// so a test host can point them elsewhere.
builder.Services.AddSingleton(services =>
{
    var configured = services.GetRequiredService<IConfiguration>()["Zanis:DataDirectory"];
    var directory = configured ?? Path.Combine(services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, ".data");
    Directory.CreateDirectory(Path.Combine(directory, "keys"));
    return new DataDirectory(directory);
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(services =>
    new Database($"Data Source={Path.Combine(services.GetRequiredService<DataDirectory>().Path, "zanis-games.db")}"));
builder.Services.AddSingleton<SettingsStore>();
builder.Services.AddSingleton<ScoreStore>();
builder.Services.AddSingleton<KioskStore>();
builder.Services.AddSingleton<AdminStore>();
builder.Services.AddSingleton<TehranClock>();
builder.Services.AddHttpClient(nameof(Downloads), Downloads.ConfigureClient);
builder.Services.AddSingleton<Downloads>();
builder.Services.AddHostedService<DownloadsRefresher>();

builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddDataProtection().SetApplicationName("zanis-games");
builder.Services.AddSingleton<IConfigureOptions<KeyManagementOptions>>(services =>
    new ConfigureOptions<KeyManagementOptions>(options => options.XmlRepository = new FileSystemXmlRepository(
        new DirectoryInfo(Path.Combine(services.GetRequiredService<DataDirectory>().Path, "keys")),
        services.GetRequiredService<ILoggerFactory>())));
builder.Services.AddAdminAuth();

// The apps call from their own origins (Android: https://appassets.androidplatform.net, Windows:
// app://zanis); these calls carry no cookies, so any origin may make them. The dashboard API is
// same-origin only.
builder.Services.AddCors(options => options.AddPolicy(GameEndpoints.CorsPolicy, policy => policy
    .AllowAnyOrigin()
    .WithMethods("GET", "POST")
    .WithHeaders("Content-Type", GameEndpoints.KioskHeader)));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
        await context.HttpContext.Response.WriteAsJsonAsync(
            new ApiError("too_many_requests", "درخواست‌ها زیاد است؛ چند دقیقهٔ دیگر دوباره امتحان کنید."), token);
    // Sign-in attempts per address in 5 minutes (Zanis:LoginLimit; tests raise it).
    options.AddPolicy("login", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = http.RequestServices.GetRequiredService<IConfiguration>().GetValue("Zanis:LoginLimit", 10),
            Window = TimeSpan.FromMinutes(5),
        }));
    options.AddPolicy("kiosk", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});

// nginx on the host terminates TLS; the service listens on the loopback only, so the forwarded
// headers can be trusted.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

var database = app.Services.GetRequiredService<Database>();
database.Migrate();
SeedAdmin(app);

app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "same-origin";
    await next();
});

// The dashboard (wwwroot/index.html) and, under /play/, the practice version of the game.
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".webp"] = "image/webp";
contentTypes.Mappings[".ttf"] = "font/ttf";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypes,
    OnPrepareResponse = context =>
    {
        // Pages and scripts change with each deployment; pictures and fonts do not.
        var cacheable = context.File.Name.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
            || context.File.Name.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase);
        context.Context.Response.Headers.CacheControl = cacheable ? "public, max-age=604800" : "no-cache";
    },
});

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/healthz", (SettingsStore settings) => Results.Ok(new { status = "ok", settingsVersion = settings.Get().Version }));
app.MapGameEndpoints();
app.MapAdminEndpoints();
app.MapDownloadEndpoints();

app.Run();

// The first dashboard account comes from the environment (ZANIS_ADMIN_USERNAME / ZANIS_ADMIN_PASSWORD)
// and is created only while there is no account at all.
static void SeedAdmin(WebApplication app)
{
    var admins = app.Services.GetRequiredService<AdminStore>();
    if (admins.Any())
    {
        return;
    }

    var username = app.Configuration["ZANIS_ADMIN_USERNAME"] ?? "admin";
    var password = app.Configuration["ZANIS_ADMIN_PASSWORD"];
    if (string.IsNullOrEmpty(password) || password.Length < 10)
    {
        app.Logger.LogWarning("No dashboard account yet: set ZANIS_ADMIN_PASSWORD (10+ characters) and restart.");
        return;
    }

    admins.Create(username, password);
    app.Logger.LogInformation("Dashboard account {Username} created.", username);
}

public partial class Program
{
}

/// <summary>Folder of the SQLite file and the cookie keys.</summary>
public sealed record DataDirectory(string Path);
