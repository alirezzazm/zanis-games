namespace Zanis.Games.Api.Game;

/// <summary>
/// Settings of the lights game, edited in the dashboard and downloaded by the apps. A round starts
/// at the <see cref="Normal"/> level and turns <see cref="Hard"/> once, at <see cref="HardFromSecond"/>.
/// The defaults and limits match web/js/game/settings.js; change both together.
/// </summary>
public sealed record GameSettings
{
    public int RoundSeconds { get; init; } = 30;
    public int LampCount { get; init; } = 12;

    /// <summary>The second at which the round switches to the hard level (0 = hard from the start).</summary>
    public int HardFromSecond { get; init; } = 15;

    public LevelSettings? Normal { get; init; } = new() { VisibleMs = 1200, Yellow = 1, Red = 1, RedChance = 30 };
    public LevelSettings? Hard { get; init; } = new() { VisibleMs = 700, Yellow = 2, Red = 2, RedChance = 50 };

    /// <summary>Dark pause between two waves (ms).</summary>
    public int GapMs { get; init; } = 150;

    public PointSettings? Points { get; init; } = new();

    /// <summary>Tournament rounds one mobile number may play; 0 = unlimited.</summary>
    public int MaxPlaysPerPhone { get; init; }

    public int TickerRecent { get; init; } = 15;
    public int TickerTop { get; init; } = 10;

    /// <summary>true: the scrolling bar and the ranks count today (Tehran time) only.</summary>
    public bool TickerTopToday { get; init; } = true;

    public static GameSettings Default => new();

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
        Range("hardFromSecond", HardFromSecond, 0, 299, "ثانیهٔ سخت شدن");
        if (!errors.ContainsKey("hardFromSecond") && !errors.ContainsKey("roundSeconds") && HardFromSecond >= RoundSeconds)
        {
            errors["hardFromSecond"] = "ثانیهٔ سخت شدن باید قبل از پایان بازی باشد.";
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

        ValidateLevel("normal", Normal, "حالت عادی");
        ValidateLevel("hard", Hard, "حالت سخت");
        return errors;

        void ValidateLevel(string path, LevelSettings? level, string label)
        {
            if (level is null)
            {
                errors[path] = $"{label} لازم است.";
                return;
            }

            Range($"{path}.visibleMs", level.VisibleMs, 150, 5000, "زمان روشن ماندن (میلی‌ثانیه)");
            Range($"{path}.yellow", level.Yellow, 1, 6, "تعداد چراغ زرد هم‌زمان");
            Range($"{path}.red", level.Red, 0, 6, "بیشترین چراغ قرمز هم‌زمان");
            Range($"{path}.redChance", level.RedChance, 0, 100, "شانس چراغ قرمز (درصد)");
            if (!errors.ContainsKey($"{path}.red") && level.Yellow + level.Red > LampCount)
            {
                errors[$"{path}.red"] = "جمع چراغ‌های زرد و قرمز یک موج از تعداد چراغ‌ها بیشتر است.";
            }
        }
    }
}

public sealed record PointSettings
{
    public int Yellow { get; init; } = 2;
    public int Red { get; init; } = -3;
    public int Empty { get; init; } = -1;
    public int Missed { get; init; }
}

/// <summary>One level of the round: pace and how many lamps light together.</summary>
public sealed record LevelSettings
{
    /// <summary>How long a wave stays lit (ms).</summary>
    public int VisibleMs { get; init; } = 1000;

    public int Yellow { get; init; } = 1;

    /// <summary>The most red lamps lit with the yellow ones.</summary>
    public int Red { get; init; }

    /// <summary>Chance (percent) of each of the <see cref="Red"/> lamps appearing in a wave.</summary>
    public int RedChance { get; init; }
}
