using System.Text;
using System.Text.RegularExpressions;

namespace Zanis.Games.Api.Game;

/// <summary>Player names and mobile numbers, the same rules as the apps (web/js/core).</summary>
public static partial class Players
{
    /// <summary>Iranian mobile number in 09xxxxxxxxx form, from Persian/Arabic/Latin digits; null when invalid.</summary>
    public static string? NormalizePhone(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        var digits = new StringBuilder();
        foreach (var c in input)
        {
            if (c is >= '0' and <= '9')
            {
                digits.Append(c);
            }
            else if (c is >= '۰' and <= '۹')
            {
                digits.Append((char)('0' + (c - '۰')));
            }
            else if (c is >= '٠' and <= '٩')
            {
                digits.Append((char)('0' + (c - '٠')));
            }
        }

        var text = digits.ToString();
        if (text.StartsWith("98", StringComparison.Ordinal))
        {
            text = "0" + text[2..];
        }

        return MobilePattern().IsMatch(text) ? text : null;
    }

    /// <summary>Collapses spaces; null when the name is too short or too long.</summary>
    public static string? CleanName(string? input)
    {
        var name = WhitespacePattern().Replace(input ?? string.Empty, " ").Trim();
        return name.Length is >= 2 and <= 40 ? name : null;
    }

    /// <summary>"علی رضایی" → "علی ر." — public screens never show full names.</summary>
    public static string ShortName(string name)
    {
        var words = name.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return words.Length switch
        {
            0 => "بازیکن",
            1 => words[0],
            _ => $"{words[0]} {words[1][0]}.",
        };
    }

    [GeneratedRegex(@"^09\d{9}$")]
    private static partial Regex MobilePattern();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespacePattern();
}
