using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FreeFlight.BavAcars.Models;

namespace FreeFlight.BavAcars.Services;

public sealed class BavApiClient : IDisposable
{
    private readonly HttpClient _http = new();
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private string _baseUrl = "http://localhost:3000";
    private string? _deviceSessionToken;
    private DateTimeOffset _accessTokenExpiresAt = DateTimeOffset.MinValue;

    public string BaseUrl => _baseUrl;
    public PilotIdentity? Pilot { get; private set; }
    public bool IsAuthenticated => _http.DefaultRequestHeaders.Authorization is not null;
    public string? DeviceSessionToken => _deviceSessionToken;

    public void ConfigureBaseUrl(string baseUrl)
    {
        _baseUrl = string.IsNullOrWhiteSpace(baseUrl) ? "http://localhost:3000" : baseUrl.Trim().TrimEnd('/');
        _http.BaseAddress = new Uri(_baseUrl + "/");
    }

    public async Task<AuthResponse> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var response = await _http.PostAsJsonAsync("api/acars/v1/auth", new { email, password, rememberDevice = true }, cancellationToken);
        await EnsureSuccess(response);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: cancellationToken)
                   ?? throw new InvalidOperationException("BAV returned an empty login response.");
        ApplyAuthentication(auth);
        return auth;
    }

    public async Task<bool> TryRestoreDeviceSessionAsync(string? deviceSessionToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(deviceSessionToken)) return false;
        _deviceSessionToken = deviceSessionToken;
        try
        {
            await RefreshAccessTokenAsync(force: true, cancellationToken);
            return true;
        }
        catch
        {
            SignOut();
            return false;
        }
    }

    public void SignOut()
    {
        _http.DefaultRequestHeaders.Authorization = null;
        Pilot = null;
        _deviceSessionToken = null;
        _accessTokenExpiresAt = DateTimeOffset.MinValue;
    }

    public async Task<Assignment?> GetAssignmentAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => new HttpRequestMessage(HttpMethod.Get, "api/acars/v1/assignment"), cancellationToken);
        await EnsureSuccess(response);
        return (await response.Content.ReadFromJsonAsync<AssignmentEnvelope>(cancellationToken: cancellationToken))?.Assignment;
    }

    public async Task<AcarsSession> StartSessionAsync(string simulator, CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => JsonRequest("api/acars/v1/sessions/start", new { simulator }), cancellationToken);
        await EnsureSuccess(response);
        return (await response.Content.ReadFromJsonAsync<StartEnvelope>(cancellationToken: cancellationToken))?.Session
               ?? throw new InvalidOperationException("BAV returned an empty ACARS session.");
    }

    public async Task SendTelemetryAsync(string sessionId, TelemetryPayload payload, CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => JsonRequest($"api/acars/v1/sessions/{sessionId}/telemetry", payload), cancellationToken);
        await EnsureSuccess(response);
    }

    public async Task<EndEnvelope> EndSessionAsync(string sessionId, int landingFpm, string comments, CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => JsonRequest($"api/acars/v1/sessions/{sessionId}/end", new { landingFpm, pilotComments = comments }), cancellationToken);
        await EnsureSuccess(response);
        return await response.Content.ReadFromJsonAsync<EndEnvelope>(cancellationToken: cancellationToken)
               ?? throw new InvalidOperationException("BAV returned an empty completed-flight response.");
    }

    public async Task<AcarsSession?> GetActiveSessionAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => new HttpRequestMessage(HttpMethod.Get, "api/acars/v1/sessions/active"), cancellationToken);
        await EnsureSuccess(response);
        return (await response.Content.ReadFromJsonAsync<ActiveSessionEnvelope>(cancellationToken: cancellationToken))?.Session;
    }

    public async Task<SessionEnvelope?> GetSessionAsync(string sessionId, CancellationToken cancellationToken = default)
    {
        using var response = await SendAuthenticatedAsync(() => new HttpRequestMessage(HttpMethod.Get, $"api/acars/v1/sessions/{sessionId}"), cancellationToken);
        await EnsureSuccess(response);
        return await response.Content.ReadFromJsonAsync<SessionEnvelope>(cancellationToken: cancellationToken);
    }

    public string UrlFor(string path) => _baseUrl + (path.StartsWith('/') ? path : "/" + path);

    private async Task<HttpResponseMessage> SendAuthenticatedAsync(Func<HttpRequestMessage> createRequest, CancellationToken cancellationToken)
    {
        await EnsureFreshAccessTokenAsync(cancellationToken);
        var response = await _http.SendAsync(createRequest(), cancellationToken);
        if (response.StatusCode != HttpStatusCode.Unauthorized) return response;

        response.Dispose();
        await RefreshAccessTokenAsync(force: true, cancellationToken);
        return await _http.SendAsync(createRequest(), cancellationToken);
    }

    private static HttpRequestMessage JsonRequest(string path, object body) => new(HttpMethod.Post, path) { Content = JsonContent.Create(body) };

    private async Task EnsureFreshAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (!IsAuthenticated || DateTimeOffset.UtcNow >= _accessTokenExpiresAt - TimeSpan.FromMinutes(5))
            await RefreshAccessTokenAsync(force: false, cancellationToken);
    }

    private async Task RefreshAccessTokenAsync(bool force, CancellationToken cancellationToken)
    {
        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            if (!force && IsAuthenticated && DateTimeOffset.UtcNow < _accessTokenExpiresAt - TimeSpan.FromMinutes(5)) return;
            if (string.IsNullOrWhiteSpace(_deviceSessionToken)) throw new AcarsAuthenticationException("Ember needs you to sign in again before it can continue this flight.");
            using var response = await _http.PostAsJsonAsync("api/acars/v1/auth/refresh", new { deviceSessionToken = _deviceSessionToken }, cancellationToken);
            await EnsureSuccess(response);
            var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken: cancellationToken)
                       ?? throw new AcarsAuthenticationException("BAV returned an empty Ember session renewal.");
            ApplyAuthentication(auth);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private void ApplyAuthentication(AuthResponse auth)
    {
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        Pilot = auth.Pilot;
        if (!string.IsNullOrWhiteSpace(auth.DeviceSessionToken)) _deviceSessionToken = auth.DeviceSessionToken;
        _accessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, auth.ExpiresInSeconds));
    }

    private static async Task EnsureSuccess(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync();
        if (response.StatusCode == HttpStatusCode.Unauthorized)
            throw new AcarsAuthenticationException("Ember sign-in expired and could not be renewed. Your flight data remains queued locally.");
        throw new InvalidOperationException(string.IsNullOrWhiteSpace(body) ? $"BAV request failed ({(int)response.StatusCode})." : body);
    }

    public void Dispose()
    {
        _refreshLock.Dispose();
        _http.Dispose();
    }
}

public sealed class AcarsAuthenticationException(string message) : InvalidOperationException(message);
