using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Zanis.Games.Api.Game;

/// <summary>One downloadable build: the file kept on this server and what the dashboard shows about it.</summary>
public sealed record DownloadFile(string FileName, long Size);

/// <summary>The builds of the latest GitHub release, mirrored into the data folder.</summary>
public sealed record DownloadSet(string Version, DateTimeOffset PublishedAt, DateTimeOffset CheckedAt, DownloadFile? Android, DownloadFile? Windows);

/// <summary>
/// Keeps a copy of the latest APK and Windows exe on this server, so visitors in Iran download them
/// from the game's own address rather than from GitHub. The files and a small index live in
/// &lt;data&gt;/downloads; a new release replaces them (each file is written beside the old one and
/// moved into place, so a download in progress never sees half a file).
/// </summary>
public sealed class Downloads(DataDirectory data, IHttpClientFactory http, IConfiguration configuration, TimeProvider time, ILogger<Downloads> logger)
{
    public const string AndroidFile = "zanis-games.apk";
    public const string WindowsFile = "zanis-games-windows.exe";
    private const string IndexFile = "release.json";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim gate = new(1, 1);

    public string Folder => Path.Combine(data.Path, "downloads");

    public string Repository => configuration["Zanis:ReleaseRepository"] ?? "alirezzazm/zanis-games";

    public DownloadSet? Current()
    {
        var index = Path.Combine(Folder, IndexFile);
        if (!File.Exists(index))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<DownloadSet>(File.ReadAllText(index), Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public string? PathOf(string fileName)
    {
        var path = Path.Combine(Folder, fileName);
        return File.Exists(path) ? path : null;
    }

    /// <summary>Downloads the latest release when it is newer than the copy here. Returns the copy in use.</summary>
    public async Task<DownloadSet?> RefreshAsync(CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var client = http.CreateClient(nameof(Downloads));
            var release = await client.GetFromJsonAsync<GitHubRelease>($"https://api.github.com/repos/{Repository}/releases/latest", Json, cancellationToken);
            if (release?.TagName is null)
            {
                return Current();
            }

            var version = release.TagName.TrimStart('v');
            var current = Current();
            if (current?.Version == version && current.Android is not null && current.Windows is not null)
            {
                var touched = current with { CheckedAt = time.GetUtcNow() };
                await WriteIndexAsync(touched, cancellationToken);
                return touched;
            }

            Directory.CreateDirectory(Folder);
            var apk = release.Assets?.FirstOrDefault(asset => asset.Name.EndsWith(".apk", StringComparison.OrdinalIgnoreCase));
            var exe = release.Assets?.FirstOrDefault(asset => asset.Name.EndsWith("-windows.exe", StringComparison.OrdinalIgnoreCase));
            var android = apk is null ? current?.Android : await FetchAsync(client, apk, AndroidFile, cancellationToken);
            var windows = exe is null ? current?.Windows : await FetchAsync(client, exe, WindowsFile, cancellationToken);

            var set = new DownloadSet(version, release.PublishedAt ?? time.GetUtcNow(), time.GetUtcNow(), android, windows);
            await WriteIndexAsync(set, cancellationToken);
            logger.LogInformation("Downloads now serve release {Version}.", version);
            return set;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<DownloadFile> FetchAsync(HttpClient client, GitHubAsset asset, string fileName, CancellationToken cancellationToken)
    {
        var target = Path.Combine(Folder, fileName);
        var temporary = target + ".part";
        using (var response = await client.GetAsync(asset.BrowserDownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken))
        {
            response.EnsureSuccessStatusCode();
            await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
            await using var file = File.Create(temporary);
            await source.CopyToAsync(file, cancellationToken);
        }

        var size = new FileInfo(temporary).Length;
        if (asset.Size > 0 && size != asset.Size)
        {
            File.Delete(temporary);
            throw new IOException($"{asset.Name}: got {size} bytes, expected {asset.Size}");
        }

        File.Move(temporary, target, overwrite: true);
        return new DownloadFile(asset.Name, size);
    }

    private async Task WriteIndexAsync(DownloadSet set, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Folder);
        var index = Path.Combine(Folder, IndexFile);
        await File.WriteAllTextAsync(index + ".part", JsonSerializer.Serialize(set, Json), cancellationToken);
        File.Move(index + ".part", index, overwrite: true);
    }

    public static void ConfigureClient(HttpClient client)
    {
        client.Timeout = TimeSpan.FromMinutes(10);
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("zanis-games-server", "1"));
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    private sealed record GitHubRelease(
        [property: JsonPropertyName("tag_name")] string? TagName,
        [property: JsonPropertyName("published_at")] DateTimeOffset? PublishedAt,
        [property: JsonPropertyName("assets")] List<GitHubAsset>? Assets);

    private sealed record GitHubAsset(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("size")] long Size,
        [property: JsonPropertyName("browser_download_url")] string BrowserDownloadUrl);
}

/// <summary>Checks GitHub for a new release every Zanis:ReleaseCheckMinutes (default 10; 0 = never).</summary>
public sealed class DownloadsRefresher(Downloads downloads, IConfiguration configuration, ILogger<DownloadsRefresher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = configuration.GetValue("Zanis:ReleaseCheckMinutes", 10);
        if (minutes <= 0)
        {
            return;
        }

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(minutes));
        do
        {
            try
            {
                await downloads.RefreshAsync(stoppingToken);
            }
            catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
            {
                // GitHub unreachable or rate-limited: keep serving the copy here and try again later.
                logger.LogWarning("Release check failed: {Message}", exception.Message);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
