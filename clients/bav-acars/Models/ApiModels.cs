using System.Text.Json.Serialization;

namespace FreeFlight.BavAcars.Models;

public sealed record PilotIdentity(string Id, string PilotNumber, string Name, string Email);
public sealed record AuthResponse(string Token, PilotIdentity Pilot, int ExpiresInSeconds, string? DeviceSessionToken = null);
public sealed record AssignmentEnvelope(Assignment? Assignment);
public sealed record Assignment(string Id, string FlightNumber, string From, string To, string Aircraft, string Departure, string Arrival, string Duration, string Date, string Status, string? CareerNotice = null);
public sealed record StartEnvelope(AcarsSession Session);
public sealed record ActiveSessionEnvelope(AcarsSession? Session);
public sealed record SessionEnvelope(AcarsSession? Session, object? Pirep = null);
public sealed record AcarsSession(
    string Id,
    string FlightNumber,
    string From,
    string To,
    string Aircraft,
    string Simulator,
    string? BookingId = null,
    string? Status = null,
    DateTimeOffset? StartedAt = null);
public sealed record ArrivalResolution(string Status, string PlannedStation, string? ActualStation, string Detection, string Message, bool CanUpdateFleet);
public sealed record FleetArrivalReconciliation(string Status, string Message);
public sealed record EndEnvelope(AcarsSession? Session, object? Pirep, ArrivalResolution? Arrival, FleetArrivalReconciliation? Fleet);

public sealed record TelemetryPayload(
    double Latitude,
    double Longitude,
    double AltitudeFt,
    double GroundSpeedKt,
    double HeadingDeg,
    double? FuelKg,
    double? FuelBurnKg,
    bool EnginesRunning,
    bool ParkingBrakeSet,
    bool OnGround,
    double? VerticalSpeedFpm,
    string? DetectedAirport = null,
    string? DiversionAirport = null,
    double? IndicatedAirspeedKt = null,
    double? TrueAirspeedKt = null,
    string? Squawk = null,
    bool BeaconOn = false);

public sealed record AppSettings(string BaseUrl, string Email)
{
    public static AppSettings Default { get; } = new("http://localhost:3000", "");
}

/** The complete local context needed to continue an interrupted Ember operation. */
public sealed record ActiveFlightRecovery(
    string SessionId,
    Assignment Assignment,
    string SimulatorId,
    DateTimeOffset FlightStarted,
    int Packets);

public sealed record EventLogItem(DateTimeOffset Time, string Event, string Detail);
