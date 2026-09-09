using System.Text.Json.Serialization;

namespace FreeFlight.BavAcars.Models;

public sealed record PilotIdentity(string Id, string PilotNumber, string Name, string Email);
public sealed record AuthResponse(string Token, PilotIdentity Pilot, int ExpiresInSeconds);
public sealed record AssignmentEnvelope(Assignment? Assignment);
public sealed record Assignment(string Id, string FlightNumber, string From, string To, string Aircraft, string Departure, string Arrival, string Duration, string Date, string Status);
public sealed record StartEnvelope(AcarsSession Session);
public sealed record AcarsSession(string Id, string FlightNumber, string From, string To, string Aircraft, string Simulator);
public sealed record EndEnvelope(bool Ok, string? Message, object? Pirep);

public sealed record TelemetryPayload(
    double Latitude,
    double Longitude,
    double AltitudeFt,
    double GroundSpeedKt,
    double HeadingDeg,
    double? FuelKg,
    bool EnginesRunning,
    bool ParkingBrakeSet,
    bool OnGround,
    double? VerticalSpeedFpm);

public sealed record AppSettings(string BaseUrl, string Email)
{
    public static AppSettings Default { get; } = new("http://localhost:3000", "");
}

public sealed record EventLogItem(DateTimeOffset Time, string Event, string Detail);
