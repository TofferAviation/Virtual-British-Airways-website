using System.IO;
using System.Text.Json;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Services;

public sealed class TelemetryQueue
{
    private sealed record QueuedTelemetry(string SessionId, TelemetryPayload Payload);
    private readonly List<QueuedTelemetry> _items = [];
    private readonly string _file;

    public TelemetryQueue()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FreeFlight", "BavAcars");
        Directory.CreateDirectory(dir);
        _file = Path.Combine(dir, "telemetry-queue.json");
        Load();
    }

    public void Enqueue(string sessionId, TelemetryPayload payload)
    {
        _items.Add(new QueuedTelemetry(sessionId, payload));
        Persist();
    }

    public int CountFor(string sessionId) => _items.Count(item => item.SessionId == sessionId);

    public bool TryPeek(string sessionId, out TelemetryPayload? payload)
    {
        payload = _items.FirstOrDefault(item => item.SessionId == sessionId)?.Payload;
        return payload is not null;
    }

    public void Dequeue(string sessionId)
    {
        var index = _items.FindIndex(item => item.SessionId == sessionId);
        if (index >= 0) _items.RemoveAt(index);
        Persist();
    }

    public void RemoveSession(string sessionId)
    {
        _items.RemoveAll(item => item.SessionId == sessionId);
        Persist();
    }

    public void RemoveOtherSessions(string currentSessionId)
    {
        _items.RemoveAll(item => item.SessionId != currentSessionId);
        Persist();
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_file)) return;
            var items = JsonSerializer.Deserialize<List<QueuedTelemetry>>(File.ReadAllText(_file));
            if (items is not null) _items.AddRange(items);
        }
        catch { }
    }

    private void Persist()
    {
        try { File.WriteAllText(_file, JsonSerializer.Serialize(_items)); } catch { }
    }
}
