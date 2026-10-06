using System.Security.Cryptography;
using Zanis.Games.Api.Auth;

namespace Zanis.Games.Api.Data;

public sealed record Admin(long Id, string Username, string PasswordHash, string Stamp);

/// <summary>Dashboard accounts. The stamp changes with the password and ends every other session.</summary>
public sealed class AdminStore(Database database, TimeProvider time)
{
    public bool Any()
    {
        using var connection = database.Open();
        using var command = connection.Command("SELECT EXISTS (SELECT 1 FROM admins)");
        return (long)command.ExecuteScalar()! == 1;
    }

    public void Create(string username, string password)
    {
        using var connection = database.Open();
        using var command = connection.Command(
            "INSERT INTO admins (username, password_hash, stamp, created_at) VALUES ($user, $hash, $stamp, $at)",
            ("$user", username),
            ("$hash", PasswordHasher.Hash(password)),
            ("$stamp", NewStamp()),
            ("$at", Sql.Iso(time.GetUtcNow())));
        command.ExecuteNonQuery();
    }

    public Admin? Find(string username)
    {
        using var connection = database.Open();
        using var command = connection.Command("SELECT id, username, password_hash, stamp FROM admins WHERE username = $user", ("$user", username));
        return ReadOne(command);
    }

    public Admin? Find(long id)
    {
        using var connection = database.Open();
        using var command = connection.Command("SELECT id, username, password_hash, stamp FROM admins WHERE id = $id", ("$id", id));
        return ReadOne(command);
    }

    /// <summary>Sets a new password and stamp; returns the new stamp.</summary>
    public string ChangePassword(long id, string newPassword)
    {
        var stamp = NewStamp();
        using var connection = database.Open();
        using var command = connection.Command(
            "UPDATE admins SET password_hash = $hash, stamp = $stamp WHERE id = $id",
            ("$hash", PasswordHasher.Hash(newPassword)),
            ("$stamp", stamp),
            ("$id", id));
        command.ExecuteNonQuery();
        return stamp;
    }

    private static Admin? ReadOne(Microsoft.Data.Sqlite.SqliteCommand command)
    {
        using var reader = command.ExecuteReader();
        return reader.Read() ? new Admin(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3)) : null;
    }

    private static string NewStamp() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
}
