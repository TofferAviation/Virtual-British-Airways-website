using System.Text.Json;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Services;

public sealed class SettingsStore
{
    private readonly string _file;

    public SettingsStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FreeFlight", "BavAcars");
        Directory.CreateDirectory(dir);
        _file = Path.Combine(dir, "settings.json");
    }

    public async Task<AppSettings> LoadAsync()
    {
        try
        {
            if (!File.Exists(_file)) return AppSettings.Default;
            var json = await File.ReadAllTextAsync(_file);
            return JsonSerializer.Deserialize<AppSettings>(json) ?? AppSettings.Default;
        }
        catch
        {
            return AppSettings.Default;
        }
    }

    public async Task SaveAsync(AppSettings settings)
    {
        var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(_file, json);
    }
}
