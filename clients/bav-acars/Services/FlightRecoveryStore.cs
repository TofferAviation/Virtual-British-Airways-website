using System.IO;
using System.Text.Json;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Services;

/** Durable local state for resuming a flight after Ember, the simulator, or Windows exits. */
public sealed class FlightRecoveryStore
{
    private readonly string _file;

    public FlightRecoveryStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FreeFlight", "BavAcars");
        Directory.CreateDirectory(dir);
        _file = Path.Combine(dir, "active-flight.json");
    }

    public async Task<ActiveFlightRecovery?> LoadAsync()
    {
        try
        {
            if (!File.Exists(_file)) return null;
            return JsonSerializer.Deserialize<ActiveFlightRecovery>(await File.ReadAllTextAsync(_file));
        }
        catch
        {
            return null;
        }
    }

    public async Task SaveAsync(ActiveFlightRecovery recovery)
    {
        var temp = _file + ".tmp";
        var json = JsonSerializer.Serialize(recovery, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(temp, json);
        File.Move(temp, _file, overwrite: true);
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
