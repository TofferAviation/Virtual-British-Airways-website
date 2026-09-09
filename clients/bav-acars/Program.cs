using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

Console.WriteLine("FreeFlight BAV ACARS v0.1 test client");
Console.Write("BAV website base URL [http://localhost:3000]: ");
var baseUrl = Console.ReadLine();
if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = "http://localhost:3000";
Console.Write("Pilot email: ");
var email = Console.ReadLine() ?? "";
Console.Write("Pilot password: ");
var password = ReadPassword();

using var http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/") };
var authResponse = await http.PostAsJsonAsync("api/acars/v1/auth", new { email, password });
if (!authResponse.IsSuccessStatusCode) {
    Console.WriteLine($"Login failed: {await authResponse.Content.ReadAsStringAsync()}");
    return;
}
var auth = await authResponse.Content.ReadFromJsonAsync<AuthResponse>();
if (auth is null) return;
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.token);
Console.WriteLine($"Logged in as {auth.pilot.name} ({auth.pilot.pilotNumber})");

var assignmentResponse = await http.GetAsync("api/acars/v1/assignment");
var assignmentEnvelope = await assignmentResponse.Content.ReadFromJsonAsync<AssignmentEnvelope>();
if (assignmentEnvelope?.assignment is null) {
    Console.WriteLine("No active BAV assignment. Book a flight on the website first.");
    return;
}
var assignment = assignmentEnvelope.assignment;
Console.WriteLine($"Assignment: {assignment.flightNumber} {assignment.from} -> {assignment.to} · {assignment.aircraft}");
Console.WriteLine("Simulator: 1=X-Plane 12, 2=MSFS 2020, 3=MSFS 2024");
Console.Write("Select [1]: ");
var simChoice = Console.ReadLine();
var simulator = simChoice switch { "2" => "msfs2020", "3" => "msfs2024", _ => "xplane12" };

var startResponse = await http.PostAsJsonAsync("api/acars/v1/sessions/start", new { simulator });
if (!startResponse.IsSuccessStatusCode) {
    Console.WriteLine($"Start failed: {await startResponse.Content.ReadAsStringAsync()}");
    return;
}
var start = await startResponse.Content.ReadFromJsonAsync<StartEnvelope>();
if (start?.session is null) return;
var session = start.session;
Console.WriteLine($"ACARS session {session.id} started.");
Console.WriteLine("This v0.1 client currently uses synthetic telemetry to exercise the complete backend pipeline.");
Console.WriteLine("Press ENTER to end the flight and create an automatic ACARS PIREP.");

var cts = new CancellationTokenSource();
var telemetryTask = Task.Run(async () => {
    var lat = 51.4700;
    var lon = -0.4543;
    var fuel = 52000.0;
    var altitude = 35000.0;
    while (!cts.IsCancellationRequested) {
        lat += 0.01;
        lon -= 0.015;
        fuel -= 60;
        var payload = new {
            latitude = lat,
            longitude = lon,
            altitudeFt = altitude,
            groundSpeedKt = 465,
            headingDeg = 285,
            fuelKg = fuel,
            enginesRunning = true,
            parkingBrakeSet = false,
            onGround = false,
            verticalSpeedFpm = 0,
        };
        try {
            var response = await http.PostAsJsonAsync($"api/acars/v1/sessions/{session.id}/telemetry", payload, cts.Token);
            if (response.IsSuccessStatusCode) Console.Write("."); else Console.Write("!");
        } catch (OperationCanceledException) { break; }
        await Task.Delay(TimeSpan.FromSeconds(5), cts.Token).ContinueWith(_ => { });
    }
});

Console.ReadLine();
cts.Cancel();
await telemetryTask;
Console.WriteLine();
Console.Write("Landing rate fpm [-150]: ");
var landingText = Console.ReadLine();
var landingFpm = int.TryParse(landingText, out var parsedLanding) ? parsedLanding : -150;
var endResponse = await http.PostAsJsonAsync($"api/acars/v1/sessions/{session.id}/end", new { landingFpm, pilotComments = "Submitted automatically by FreeFlight BAV ACARS v0.1 test client." });
Console.WriteLine(endResponse.IsSuccessStatusCode
    ? "Flight ended. Automatic ACARS PIREP submitted to BAV Operations."
    : $"End failed: {await endResponse.Content.ReadAsStringAsync()}");

static string ReadPassword() {
    var chars = new List<char>();
    while (true) {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return new string(chars.ToArray()); }
        if (key.Key == ConsoleKey.Backspace && chars.Count > 0) { chars.RemoveAt(chars.Count - 1); continue; }
        if (!char.IsControl(key.KeyChar)) chars.Add(key.KeyChar);
    }
}

record AuthResponse(string token, PilotIdentity pilot, int expiresInSeconds);
record PilotIdentity(string id, string pilotNumber, string name, string email);
record AssignmentEnvelope(Assignment? assignment);
record Assignment(string id, string flightNumber, string from, string to, string aircraft, string departure, string arrival, string duration, string date, string status);
record StartEnvelope(AcarsSession session);
record AcarsSession(string id, string flightNumber, string from, string to, string aircraft, string simulator);
