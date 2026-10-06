namespace Zanis.Games.Api.Game;

/// <summary>
/// Settings of the lights game, edited in the dashboard and downloaded by the apps. The defaults and
/// limits match web/js/game/settings.js; change both together.
/// </summary>
public sealed record GameSettings
{
    public int RoundSeconds { get; init; } = 30;
    public int LampCount { get; init; } = 12;

    /// <summary>How long a wave stays lit at the start of the round (ms); it shrinks evenly to <see cref="EndVisibleMs"/>.</summary>
    public int StartVisibleMs { get; init; } = 1300;
    public int EndVisibleMs { get; init; } = 500;

    /// <summary>Dark pause between two waves (ms).</summary>
    public int GapMs { get; init; } = 150;

    public PointSettings? Points { get; init; } = new();
    public List<StageSettings>? Stages { get; init; } = DefaultStages();

    /// <summary>Tournament rounds one mobile number may play; 0 = unlimited.</summary>
    public int MaxPlaysPerPhone { get; init; }

    public int TickerRecent { get; init; } = 15;
    public int TickerTop { get; init; } = 10;

    /// <summary>true: the scrolling bar and the ranks count today (Tehran time) only.</summary>
    public bool TickerTopToday { get; init; } = true;

    public static GameSettings Default => new();

    private static List<StageSettings> DefaultStages() =>
    [
        new() { FromSecond = 0, Yellow = 1, Red = 1, RedChance = 30 },
        new() { FromSecond = 10, Yellow = 2, Red = 1, RedChance = 40 },
        new() { FromSecond = 20, Yellow = 2, Red = 2, RedChance = 50 },
    ];

    /// <summary>Checks every limit; returns field path → Persian message (empty when valid).</summary>
    public Dictionary<string, string> Validate()
    {
        var errors = new Dictionary<string, string>();

        void Range(string field, int value, int min, int max, string label)
        {
            if (value < min || value > max)
            {
                errors[field] = $"{label} باید بین {min} و {max} باشد.";
            }
        }

        Range("roundSeconds", RoundSeconds, 10, 300, "زمان بازی (ثانیه)");
        Range("lampCount", LampCount, 4, 24, "تعداد چراغ‌ها");
        Range("startVisibleMs", StartVisibleMs, 200, 5000, "زمان روشن ماندن در شروع");
        Range("endVisibleMs", EndVisibleMs, 150, 5000, "زمان روشن ماندن در پایان");
        if (!errors.ContainsKey("endVisibleMs") && EndVisibleMs > StartVisibleMs)
        {
            errors["endVisibleMs"] = "زمان روشن ماندن در پایان نباید از شروع بیشتر باشد؛ بازی باید سریع‌تر شود.";
        }

        Range("gapMs", GapMs, 0, 2000, "مکث بین موج‌ها");
        Range("maxPlaysPerPhone", MaxPlaysPerPhone, 0, 100, "دفعات مجاز بازی");
        Range("tickerRecent", TickerRecent, 0, 50, "تعداد آخرین بازی‌ها در نوار");
        Range("tickerTop", TickerTop, 0, 50, "تعداد برترین‌ها در نوار");

        if (Points is null)
        {
            errors["points"] = "امتیازها لازم است.";
        }
        else
        {
            Range("points.yellow", Points.Yellow, 0, 100, "امتیاز چراغ زرد");
            Range("points.red", Points.Red, -100, 0, "امتیاز زدن چراغ قرمز");
            Range("points.empty", Points.Empty, -100, 0, "امتیاز زدن خانهٔ خاموش");
            Range("points.missed", Points.Missed, -100, 0, "امتیاز چراغ زرد جامانده");
        }

        if (Stages is null || Stages.Count is < 1 or > 10)
        {
            errors["stages"] = "بین ۱ تا ۱۰ مرحله لازم است.";
            return errors;
        }

        for (var i = 0; i < Stages.Count; i++)
        {
            var stage = Stages[i];
            var path = $"stages[{i}]";
            if (stage is null)
            {
                errors[path] = "مرحله خالی است.";
                continue;
            }

            if (i == 0 && stage.FromSecond != 0)
            {
                errors[$"{path}.fromSecond"] = "مرحلهٔ اول باید از ثانیهٔ ۰ شروع شود.";
            }
            else if (i > 0 && Stages[i - 1] is { } previous && stage.FromSecond <= previous.FromSecond)
            {
                errors[$"{path}.fromSecond"] = "شروع هر مرحله باید بعد از مرحلهٔ قبل باشد.";
            }
            else if (stage.FromSecond >= RoundSeconds)
            {
                errors[$"{path}.fromSecond"] = "این مرحله بعد از پایان بازی شروع می‌شود.";
            }

            Range($"{path}.yellow", stage.Yellow, 1, 6, "تعداد چراغ زرد هم‌زمان");
            Range($"{path}.red", stage.Red, 0, 6, "بیشترین چراغ قرمز هم‌زمان");
            Range($"{path}.redChance", stage.RedChance, 0, 100, "شانس چراغ قرمز (درصد)");
            if (stage.Yellow + stage.Red > LampCount)
            {
                errors[$"{path}.red"] = "جمع چراغ‌های زرد و قرمز یک موج از تعداد چراغ‌ها بیشتر است.";
            }
        }

        return errors;
    }
}

public sealed record PointSettings
{
    public int Yellow { get; init; } = 2;
    public int Red { get; init; } = -3;
    public int Empty { get; init; } = -1;
    public int Missed { get; init; }
}

public sealed record StageSettings
{
    public int FromSecond { get; init; }
    public int Yellow { get; init; } = 1;
    public int Red { get; init; }

    /// <summary>Chance (percent) of each of the <see cref="Red"/> lamps appearing in a wave.</summary>
    public int RedChance { get; init; }
}
