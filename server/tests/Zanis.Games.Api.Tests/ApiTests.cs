using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Zanis.Games.Api.Game;

namespace Zanis.Games.Api.Tests;

/// <summary>The whole service over HTTP, on a fresh SQLite file per test class.</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string Password = "test-password-123";
    private readonly string directory = Path.Combine(Path.GetTempPath(), "zanis-games-tests", Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Zanis:DataDirectory", directory);
        builder.UseSetting("ZANIS_ADMIN_USERNAME", "admin");
        builder.UseSetting("ZANIS_ADMIN_PASSWORD", Password);
        builder.UseSetting("Zanis:LoginLimit", "1000");
    }

    /// <summary>A client signed in to the dashboard (the cookie is kept by the handler).</summary>
    public async Task<HttpClient> AdminAsync()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        client.DefaultRequestHeaders.Add("X-Zanis-Admin", "1");
        var response = await client.PostAsJsonAsync("/api/admin/login", new { username = "admin", password = Password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>A client carrying the key of a new booth computer.</summary>
    public async Task<HttpClient> KioskAsync(string name = "غرفه")
    {
        var admin = await AdminAsync();
        var created = await admin.PostAsJsonAsync("/api/admin/kiosks", new { name });
        var body = await created.Content.ReadFromJsonAsync<JsonElement>();
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Kiosk-Key", body.GetProperty("key").GetString());
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            Directory.Delete(directory, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }
}

public sealed class ApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static object Round(string phone, int score, string? clientId = null, string name = "مریم احمدی") => new
    {
        clientId = clientId ?? Guid.NewGuid().ToString(),
        name,
        phone,
        score,
        hits = score / 2,
        redTaps = 1,
        wrongTaps = 0,
        missed = 2,
        settingsVersion = 1,
        playedAt = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task Apps_from_other_origins_may_call_the_game_api()
    {
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/kiosk/scores");
        request.Headers.Add("Origin", "https://appassets.androidplatform.net");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,x-kiosk-key");
        var response = await client.SendAsync(request);
        Assert.Equal("*", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task The_dashboard_api_needs_a_sign_in_and_the_csrf_header()
    {
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/settings")).StatusCode);

        var noHeader = factory.CreateClient();
        var login = await noHeader.PostAsJsonAsync("/api/admin/login", new { username = "admin", password = ApiFactory.Password });
        Assert.Equal(HttpStatusCode.Forbidden, login.StatusCode);

        var withHeader = factory.CreateClient();
        withHeader.DefaultRequestHeaders.Add("X-Zanis-Admin", "1");
        var wrong = await withHeader.PostAsJsonAsync("/api/admin/login", new { username = "admin", password = "nope-nope-nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
    }

    [Fact]
    public async Task Saved_settings_reach_the_apps_with_a_new_version()
    {
        var admin = await factory.AdminAsync();
        var current = await admin.GetFromJsonAsync<JsonElement>("/api/admin/settings");
        var version = current.GetProperty("version").GetInt32();
        var settings = GameSettings.Default with
        {
            RoundSeconds = 45,
            HardFromSecond = 20,
            Hard = new LevelSettings { VisibleMs = 600, Yellow = 2, Red = 2, RedChance = 60 },
        };

        var saved = await admin.PutAsJsonAsync("/api/admin/settings", new { settings, expectedVersion = version });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var game = await factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/game/settings");
        Assert.Equal(version + 1, game.GetProperty("version").GetInt32());
        Assert.Equal(45, game.GetProperty("settings").GetProperty("roundSeconds").GetInt32());
        Assert.Equal(20, game.GetProperty("settings").GetProperty("hardFromSecond").GetInt32());
        Assert.Equal(60, game.GetProperty("settings").GetProperty("hard").GetProperty("redChance").GetInt32());

        // A save based on an old version is refused instead of overwriting.
        var stale = await admin.PutAsJsonAsync("/api/admin/settings", new { settings, expectedVersion = version });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Invalid_settings_are_refused_with_a_message_per_field()
    {
        var admin = await factory.AdminAsync();
        var settings = GameSettings.Default with
        {
            RoundSeconds = 20,
            HardFromSecond = 25,
            LampCount = 4,
            Normal = new LevelSettings { VisibleMs = 50, Yellow = 1, Red = 0, RedChance = 0 },
            Hard = new LevelSettings { VisibleMs = 600, Yellow = 3, Red = 3, RedChance = 50 },
        };
        var response = await admin.PutAsJsonAsync("/api/admin/settings", new { settings });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("hardFromSecond", out _));
        Assert.True(errors.TryGetProperty("normal.visibleMs", out _));
        Assert.True(errors.TryGetProperty("hard.red", out _));
    }

    [Fact]
    public async Task Scores_need_a_valid_kiosk_key()
    {
        var stranger = factory.CreateClient();
        stranger.DefaultRequestHeaders.Add("X-Kiosk-Key", "zk_not-a-real-key");
        var response = await stranger.PostAsJsonAsync("/api/kiosk/scores", Round("09121111111", 10));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_round_is_stored_once_and_ranked()
    {
        var kiosk = await factory.KioskAsync();
        var round = Round("09122222222", 90, "round-once");
        var first = await kiosk.PostAsJsonAsync("/api/kiosk/scores", round);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var again = await kiosk.PostAsJsonAsync("/api/kiosk/scores", round);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var receipt = await again.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(receipt.GetProperty("stored").GetBoolean());
        Assert.Equal(1, receipt.GetProperty("plays").GetInt32());

        var plays = await kiosk.GetFromJsonAsync<JsonElement>("/api/kiosk/plays?phone=۰۹۱۲۲۲۲۲۲۲۲");
        Assert.Equal(1, plays.GetProperty("plays").GetInt32());
    }

    [Fact]
    public async Task Ranks_and_the_ticker_use_each_players_best_round()
    {
        var kiosk = await factory.KioskAsync();
        await kiosk.PostAsJsonAsync("/api/kiosk/scores", Round("09130000001", 5000, name: "سارا کریمی"));
        await kiosk.PostAsJsonAsync("/api/kiosk/scores", Round("09130000002", 4000, name: "علی رضایی"));
        var low = await kiosk.PostAsJsonAsync("/api/kiosk/scores", Round("09130000002", 100, name: "علی رضایی"));
        var receipt = await low.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4000, receipt.GetProperty("best").GetInt32());
        Assert.Equal(2, receipt.GetProperty("rank").GetInt32());

        var ticker = await factory.CreateClient().GetFromJsonAsync<JsonElement>("/api/game/ticker");
        var top = ticker.GetProperty("top");
        Assert.Equal("سارا ک.", top[0].GetProperty("name").GetString());
        Assert.Equal(5000, top[0].GetProperty("score").GetInt32());
        Assert.Equal("علی ر.", top[1].GetProperty("name").GetString());
        Assert.Equal(100, ticker.GetProperty("recent")[0].GetProperty("score").GetInt32());
        Assert.DoesNotContain("0913", ticker.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Bad_rounds_are_refused()
    {
        var kiosk = await factory.KioskAsync();
        var response = await kiosk.PostAsJsonAsync("/api/kiosk/scores", new { clientId = "x", name = "ع", phone = "123", score = -1 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("name", out _));
        Assert.True(errors.TryGetProperty("phone", out _));
        Assert.True(errors.TryGetProperty("score", out _));
    }

    [Fact]
    public async Task A_revoked_kiosk_can_no_longer_send()
    {
        var admin = await factory.AdminAsync();
        var created = await (await admin.PostAsJsonAsync("/api/admin/kiosks", new { name = "موقت" })).Content.ReadFromJsonAsync<JsonElement>();
        var kiosk = factory.CreateClient();
        kiosk.DefaultRequestHeaders.Add("X-Kiosk-Key", created.GetProperty("key").GetString());
        Assert.Equal(HttpStatusCode.OK, (await kiosk.GetAsync("/api/kiosk/ping")).StatusCode);

        var id = created.GetProperty("kiosk").GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/kiosks/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await kiosk.GetAsync("/api/kiosk/ping")).StatusCode);
    }

    [Fact]
    public async Task The_admin_sees_phones_and_can_export_and_delete()
    {
        var kiosk = await factory.KioskAsync("نمایشگر");
        await kiosk.PostAsJsonAsync("/api/kiosk/scores", Round("09140000001", 77, name: "رضا \"تست\""));
        var admin = await factory.AdminAsync();

        var page = await admin.GetFromJsonAsync<JsonElement>("/api/admin/scores?search=0914");
        Assert.Equal(1, page.GetProperty("total").GetInt32());
        var row = page.GetProperty("items")[0];
        Assert.Equal("09140000001", row.GetProperty("phone").GetString());
        Assert.Equal("نمایشگر", row.GetProperty("kiosk").GetString());

        var csv = await admin.GetStringAsync("/api/admin/scores.csv");
        Assert.Contains("\"رضا \"\"تست\"\"\",09140000001,77", csv, StringComparison.Ordinal);

        var id = row.GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/scores/{id}")).StatusCode);
        var after = await admin.GetFromJsonAsync<JsonElement>("/api/admin/scores?search=0914");
        Assert.Equal(0, after.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Clearing_every_score_needs_the_typed_phrase()
    {
        var admin = await factory.AdminAsync();
        var refused = await admin.PostAsJsonAsync("/api/admin/scores/clear", new { confirm = "yes" });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task The_dashboard_and_health_check_are_served()
    {
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/healthz")).StatusCode);
        var page = await client.GetStringAsync("/");
        Assert.Contains("admin.js", page, StringComparison.Ordinal);
    }
}

/// <summary>On a database of its own, so no other test has saved settings yet.</summary>
public sealed class FreshServerTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Settings_are_public_and_start_with_the_defaults()
    {
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/game/settings");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var settings = body.GetProperty("settings");
        Assert.Equal(30, settings.GetProperty("roundSeconds").GetInt32());
        Assert.Equal(15, settings.GetProperty("hardFromSecond").GetInt32());
        Assert.Equal(2, settings.GetProperty("hard").GetProperty("yellow").GetInt32());
        Assert.Equal(2, settings.GetProperty("points").GetProperty("yellow").GetInt32());
    }
}

public sealed class PasswordChangeTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Changing_the_password_ends_other_sessions()
    {
        var first = await factory.AdminAsync();
        var second = await factory.AdminAsync();
        var change = await first.PutAsJsonAsync("/api/admin/password", new { currentPassword = ApiFactory.Password, newPassword = "a-brand-new-password" });
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/admin/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/admin/me")).StatusCode);
    }
}

public sealed class RulesTests
{
    [Theory]
    [InlineData("09121234567", "09121234567")]
    [InlineData("۰۹۱۲ ۱۲۳ ۴۵۶۷", "09121234567")]
    [InlineData("+98 912 123 4567", "09121234567")]
    [InlineData("0912123456", null)]
    [InlineData("", null)]
    public void Mobile_numbers_are_normalised(string input, string? expected) =>
        Assert.Equal(expected, Players.NormalizePhone(input));

    [Fact]
    public void Default_settings_are_valid() => Assert.Empty(GameSettings.Default.Validate());

    [Fact]
    public void Short_names_hide_the_family_name() => Assert.Equal("مریم ا.", Players.ShortName("مریم  احمدی"));
}
