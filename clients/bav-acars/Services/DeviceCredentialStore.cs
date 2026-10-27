using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace FreeFlight.BavAcars.Services;

/** Stores only the renewable device credential, protected for the signed-in Windows user. */
public sealed class DeviceCredentialStore
{
    private readonly string _file;

    public DeviceCredentialStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FreeFlight", "BavAcars");
        Directory.CreateDirectory(dir);
        _file = Path.Combine(dir, "device-credential.bin");
    }

    public async Task<string?> LoadAsync()
    {
        try
        {
            if (!File.Exists(_file)) return null;
            var protectedBytes = await File.ReadAllBytesAsync(_file);
            var raw = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }
        catch
        {
            return null;
        }
    }

    public async Task SaveAsync(string? deviceSessionToken)
    {
        if (string.IsNullOrWhiteSpace(deviceSessionToken))
        {
            Clear();
            return;
        }

        var raw = Encoding.UTF8.GetBytes(deviceSessionToken);
        var protectedBytes = ProtectedData.Protect(raw, optionalEntropy: null, DataProtectionScope.CurrentUser);
        await File.WriteAllBytesAsync(_file, protectedBytes);
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_file)) File.Delete(_file);
        }
        catch { }
    }
}
