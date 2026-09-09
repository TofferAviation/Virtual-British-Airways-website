using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Simulators;

public interface ISimulatorAdapter
{
    string Id { get; }
    string DisplayName { get; }
    bool IsDetected { get; }
    bool HasNativeTelemetry { get; }
    void RefreshDetection();
    TelemetryPayload CreateDevelopmentTelemetry(double progress, TimeSpan elapsed);
}
