using System.Net.Http.Headers;
using System.Net.Http.Json;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Services;

public sealed class BavApiClient : IDisposable
{
    private readonly HttpClient _http = new();
    private string _baseUrl = "http://localhost:3000";

    public string BaseUrl => _baseUrl;
    public PilotIdentity? Pilot { get; private set; }
    public bool IsAuthenticated => _http.DefaultRequestHeaders.Authorization is not null;

    public void ConfigureBaseUrl(string baseUrl)
    {
        _baseUrl = string.IsNullOrWhiteSpace(baseUrl) ? "http://localhost:3000" : baseUrl.Trim().TrimEnd('/');
        _http.BaseAddress = new Uri(_baseUrl + "/");
    }

    public async Task<AuthResponse> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var response = await _http.PostAsJsonAsync("api/acars/v1/auth", new { email, password }, cancellationToken);
        await EnsureSuccess(response);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: cancellationToken)
                   ?? throw new InvalidOperationException("BAV returned an empty login response.");
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        Pilot = auth.Pilot;
        return auth;
    }

    public void SignOut()
    {
        _http.DefaultRequestHeaders.Authorization = null;
        Pilot = null;
    }

    public async Task<Assignment?> GetAssignmentAsync(CancellationToken cancellationToken = default)
    {
        var response = await _http.GetAsync("api/acars/v1/assignment", cancellationToken);
        await EnsureSuccess(response);
        return (await response.Content.ReadFromJsonAsync<AssignmentEnvelope>(cancellationToken: cancellationToken))?.Assignment;
    }

    public async Task<AcarsSession> StartSessionAsync(string simulator, CancellationToken cancellationToken = default)
    {
        var response = await _http.PostAsJsonAsync("api/acars/v1/sessions/start", new { simulator }, cancellationToken);
        await EnsureSuccess(response);
        return (await response.Content.ReadFromJsonAsync<StartEnvelope>(cancellationToken: cancellationToken))?.Session
               ?? throw new InvalidOperationException("BAV returned an empty ACARS session.");
    }

    public async Task SendTelemetryAsync(string sessionId, TelemetryPayload payload, CancellationToken cancellationToken = default)
    {
        var response = await _http.PostAsJsonAsync($"api/acars/v1/sessions/{sessionId}/telemetry", payload, cancellationToken);
        await EnsureSuccess(response);
    }

    public async Task EndSessionAsync(string sessionId, int landingFpm, string comments, CancellationToken cancellationToken = default)
    {
        var response = await _http.PostAsJsonAsync($"api/acars/v1/sessions/{sessionId}/end", new { landingFpm, pilotComments = comments }, cancellationToken);
        await EnsureSuccess(response);
    }

    public string UrlFor(string path) => _baseUrl + (path.StartsWith('/') ? path : "/" + path);

    private static async Task EnsureSuccess(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync();
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(body) ? $"BAV request failed ({(int)response.StatusCode})." : body);
    }

    public void Dispose() => _http.Dispose();
}
