using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Zanis.Games.Api.Game;

/// <summary>One downloadable build: the file kept on this server and what the dashboard shows about it.</summary>
public sealed record DownloadFile(string FileName, long Size);

/// <summary>A download under way: bytes received of the total.</summary>
public sealed record DownloadProgress(string FileName, long Received, long Total);

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

    /// <summary>The file being downloaded right now, for the dashboard; null when idle.</summary>
    public DownloadProgress? InProgress { get; private set; }

    /// <summary>Starts a check in the background unless one is running; true when one started.</summary>
    public bool StartRefresh()
    {
        if (gate.CurrentCount == 0)
        {
            return false;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await RefreshAsync(CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogWarning("Release check failed: {Message}", exception.Message);
            }
        });
        return true;
    }

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
            var publishedAt = release.PublishedAt ?? time.GetUtcNow();

            // The small APK first, published on its own, so it is downloadable while the large exe
            // is still on its way (GitHub can be slow from Iran).
            var android = current?.Version == version && current.Android is not null ? current.Android
                : apk is null ? null : await FetchAsync(client, apk, AndroidFile, cancellationToken);
            var windowsSoFar = current?.Version == version ? current.Windows : null;
            await WriteIndexAsync(new DownloadSet(version, publishedAt, time.GetUtcNow(), android, windowsSoFar), cancellationToken);

            var windows = windowsSoFar ?? (exe is null ? null : await FetchAsync(client, exe, WindowsFile, cancellationToken));
            var set = new DownloadSet(version, publishedAt, time.GetUtcNow(), android, windows);
            await WriteIndexAsync(set, cancellationToken);
            logger.LogInformation("Downloads now serve release {Version}.", version);
            return set;
        }
        finally
        {
            InProgress = null;
            gate.Release();
        }
    }

    /// <summary>
    /// Downloads one asset into "&lt;name&gt;.part", continuing a part left by an interrupted attempt,
    /// and moves it into place once complete. The part is named after the release asset, so a part of
    /// an older version is never continued with a newer one.
    /// </summary>
    private async Task<DownloadFile> FetchAsync(HttpClient client, GitHubAsset asset, string fileName, CancellationToken cancellationToken)
    {
        var target = Path.Combine(Folder, fileName);
        var temporary = Path.Combine(Folder, asset.Name + ".part");
        // A part of an older release of the same build is never continued.
        var kind = fileName == AndroidFile ? "*.apk.part" : "*-windows.exe.part";
        foreach (var stale in Directory.GetFiles(Folder, kind).Where(part => part != temporary))
        {
            File.Delete(stale);
        }

        var have = File.Exists(temporary) ? new FileInfo(temporary).Length : 0;
        if (asset.Size > 0 && have > asset.Size)
        {
            File.Delete(temporary);
            have = 0;
        }

        if (asset.Size == 0 || have < asset.Size)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, asset.BrowserDownloadUrl);
            if (have > 0)
            {
                request.Headers.Range = new RangeHeaderValue(have, null);
            }

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            // 206 continues the part; 200 means the server sent the whole file again.
            var append = have > 0 && response.StatusCode == System.Net.HttpStatusCode.PartialContent;
            await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
            await using var file = new FileStream(temporary, append ? FileMode.Append : FileMode.Create, FileAccess.Write);
            var received = append ? have : 0;
            var buffer = new byte[81920];
            int read;
            while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
            {
                await file.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                received += read;
                InProgress = new DownloadProgress(asset.Name, received, asset.Size);
            }
        }

        var size = new FileInfo(temporary).Length;
        if (asset.Size > 0 && size != asset.Size)
        {
            throw new IOException($"{asset.Name}: {size} of {asset.Size} bytes so far; continuing next time");
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
        // Large files over a slow link: a cut download continues next time from where it stopped.
        client.Timeout = TimeSpan.FromHours(2);
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
