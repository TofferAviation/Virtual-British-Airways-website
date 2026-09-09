using System.Diagnostics;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Simulators;

public sealed class ProcessSimulatorAdapter : ISimulatorAdapter
{
    private readonly string[] _processNames;
    private readonly (double lat, double lon) _start = (51.4700, -0.4543);
    private readonly (double lat, double lon) _end = (40.6413, -73.7781);

    public ProcessSimulatorAdapter(string id, string displayName, params string[] processNames)
    {
        Id = id;
        DisplayName = displayName;
        _processNames = processNames;
    }

    public string Id { get; }
    public string DisplayName { get; }
    public bool IsDetected { get; private set; }
    public bool HasNativeTelemetry => false;

    public void RefreshDetection()
    {
        try
        {
            var running = Process.GetProcesses().Select(process => process.ProcessName).ToHashSet(StringComparer.OrdinalIgnoreCase);
            IsDetected = _processNames.Any(running.Contains);
        }
        catch
        {
            IsDetected = false;
        }
    }

    public TelemetryPayload CreateDevelopmentTelemetry(double progress, TimeSpan elapsed)
    {
        progress = Math.Clamp(progress, 0, 1);
        var lat = _start.lat + (_end.lat - _start.lat) * progress;
        var lon = _start.lon + (_end.lon - _start.lon) * progress;
        var climb = Math.Min(1, elapsed.TotalMinutes / 25d);
        var descent = progress > .82 ? Math.Max(0, 1 - (progress - .82) / .18) : 1;
        var altitude = 37000 * Math.Min(climb, descent);
        var onGround = progress < .015 || progress > .995;
        return new TelemetryPayload(
            lat,
            lon,
            onGround ? 80 : altitude,
            onGround ? 18 : 489,
            284,
            Math.Max(3200, 62000 - progress * 47000),
            true,
            progress < .005 || progress > .998,
            onGround,
            onGround ? 0 : (climb < 1 ? 1800 : descent < 1 ? -1400 : 0));
    }
}

public static class SimulatorCatalog
{
    public static IReadOnlyList<ISimulatorAdapter> Create() => new ISimulatorAdapter[]
    {
        new ProcessSimulatorAdapter("xplane12", "X-Plane 12", "X-Plane", "X-Plane-12", "X-Plane 12"),
        new ProcessSimulatorAdapter("msfs2020", "Microsoft Flight Simulator 2020", "FlightSimulator"),
        new ProcessSimulatorAdapter("msfs2024", "Microsoft Flight Simulator 2024", "FlightSimulator2024", "FlightSimulator2024-Win64-Shipping")
    };
}
