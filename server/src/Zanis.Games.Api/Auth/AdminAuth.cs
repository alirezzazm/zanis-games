using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Zanis.Games.Api.Data;

namespace Zanis.Games.Api.Auth;

/// <summary>Dashboard sign-in: an HttpOnly, SameSite=Strict cookie checked against the account's stamp on every request.</summary>
public static class AdminAuth
{
    public const string Scheme = CookieAuthenticationDefaults.AuthenticationScheme;
    public const string Policy = "admin";

    /// <summary>
    /// Mutating dashboard calls must carry this header. A plain HTML form or a cross-site page cannot
    /// add it without a CORS preflight, which this service never grants for /api/admin.
    /// </summary>
    public const string CsrfHeader = "X-Zanis-Admin";

    private const string StampClaim = "stamp";

    public static IServiceCollection AddAdminAuth(this IServiceCollection services)
    {
        services
            .AddAuthentication(Scheme)
            .AddCookie(Scheme, options =>
            {
                options.Cookie.Name = "zanis_admin";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                options.ExpireTimeSpan = TimeSpan.FromHours(12);
                options.SlidingExpiration = true;
                // An API answers 401/403; the dashboard page shows its own sign-in form.
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
                options.Events.OnValidatePrincipal = async context =>
                {
                    var admins = context.HttpContext.RequestServices.GetRequiredService<AdminStore>();
                    var admin = AdminId(context.Principal) is { } id ? admins.Find(id) : null;
                    if (admin is null || admin.Stamp != context.Principal?.FindFirstValue(StampClaim))
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(Scheme);
                    }
                };
            });
        services.AddAuthorizationBuilder().AddPolicy(Policy, policy => policy.RequireAuthenticatedUser());
        return services;
    }

    public static Task SignInAsync(HttpContext http, Admin admin)
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, admin.Id.ToString(CultureInfo.InvariantCulture)),
                new Claim(ClaimTypes.Name, admin.Username),
                new Claim(StampClaim, admin.Stamp),
            ],
            Scheme);
        return http.SignInAsync(Scheme, new ClaimsPrincipal(identity));
    }

    public static long? AdminId(ClaimsPrincipal? user) =>
        long.TryParse(user?.FindFirstValue(ClaimTypes.NameIdentifier), CultureInfo.InvariantCulture, out var id) ? id : null;

    /// <summary>Rejects mutating calls without <see cref="CsrfHeader"/>.</summary>
    public static async ValueTask<object?> RequireCsrfHeader(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var request = context.HttpContext.Request;
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method) && request.Headers[CsrfHeader] != "1")
        {
            return Results.Json(new ApiError("csrf_header_missing", "درخواست از داشبورد نیامده است."), statusCode: StatusCodes.Status403Forbidden);
        }

        return await next(context);
    }
}

/// <summary>Error body of every failed call: a code for programs and a Persian message for people.</summary>
public sealed record ApiError(string Error, string Message, IReadOnlyDictionary<string, string>? Errors = null);
