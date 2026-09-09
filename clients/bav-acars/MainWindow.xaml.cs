using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using FreeFlight.BavAcars.Models;
using FreeFlight.BavAcars.Services;
using FreeFlight.BavAcars.Simulators;

namespace FreeFlight.BavAcars;

public partial class MainWindow : Window
{
    private readonly BavApiClient _api = new();
    private readonly SettingsStore _settings = new();
    private readonly TelemetryQueue _queue = new();
    private readonly IReadOnlyList<ISimulatorAdapter> _simulators = SimulatorCatalog.Create();
    private readonly ObservableCollection<EventLogItem> _events = new();
    private readonly DispatcherTimer _scanTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer _telemetryTimer = new() { Interval = TimeSpan.FromSeconds(5) };

    private Assignment? _assignment;
    private AcarsSession? _session;
    private DateTimeOffset? _flightStarted;
    private int _packets;
    private bool _paused;
    private bool _sending;

    public MainWindow()
    {
        InitializeComponent();
        EventList.ItemsSource = _events;
        SimulatorCombo.ItemsSource = _simulators;
        SimulatorCombo.DisplayMemberPath = nameof(ISimulatorAdapter.DisplayName);
        SimulatorCombo.SelectedIndex = 0;
        _scanTimer.Tick += (_, _) => RefreshSimulatorDetection();
        _telemetryTimer.Tick += async (_, _) => await TelemetryTickAsync();
        Loaded += async (_, _) => await InitializeAsync();
        Closed += (_, _) => _api.Dispose();
    }

    private async Task InitializeAsync()
    {
        var settings = await _settings.LoadAsync();
        LoginBaseUrl.Text = settings.BaseUrl;
        LoginEmail.Text = settings.Email;
        _api.ConfigureBaseUrl(settings.BaseUrl);
        RefreshSimulatorDetection();
        _scanTimer.Start();
        AddEvent("Application", "FreeFlight BAV ACARS v1.0 ready");
    }

    private async void Login_Click(object sender, RoutedEventArgs e)
    {
        LoginButton.IsEnabled = false;
        LoginStatus.Text = "Connecting to British Airways Virtual…";
        try
        {
            _api.ConfigureBaseUrl(LoginBaseUrl.Text);
            var auth = await _api.LoginAsync(LoginEmail.Text, LoginPassword.Password);
            await _settings.SaveAsync(new AppSettings(_api.BaseUrl, LoginEmail.Text.Trim()));
            LoginPassword.Clear();
            PilotNameText.Text = auth.Pilot.Name;
            PilotIdText.Text = auth.Pilot.PilotNumber;
            WelcomeText.Text = $"Welcome back, {auth.Pilot.Name}";
            WebsiteStatusText.Text = "Connected";
            WebsiteSyncText.Text = "BAV pilot account linked";
            LoginOverlay.Visibility = Visibility.Collapsed;
            AddEvent("BAV login", $"Signed in as {auth.Pilot.PilotNumber}");
            await SyncAssignmentAsync();
        }
        catch (Exception ex)
        {
            LoginStatus.Text = FriendlyError(ex);
        }
        finally
        {
            LoginButton.IsEnabled = true;
        }
    }

    private async Task SyncAssignmentAsync()
    {
        if (!_api.IsAuthenticated) return;
        try
        {
            AssignmentSyncText.Text = "Synchronising…";
            _assignment = await _api.GetAssignmentAsync();
            if (_assignment is null)
            {
                AssignmentFlightText.Text = "NO FLIGHT";
                RouteText.Text = "No active BAV assignment";
                AircraftText.Text = "Book a flight on the website first.";
                ScheduleText.Text = "Assignment sync complete";
                StartFlightButton.IsEnabled = false;
                AssignmentSyncText.Text = "No active assignment";
                AddEvent("Assignment sync", "No booked flight found");
                return;
            }

            AssignmentFlightText.Text = _assignment.FlightNumber;
            RouteText.Text = $"{_assignment.From}  →  {_assignment.To}";
            AircraftText.Text = $"Aircraft  {_assignment.Aircraft}";
            ScheduleText.Text = $"{_assignment.Date} · {_assignment.Departure}–{_assignment.Arrival} UTC · {_assignment.Duration}";
            DepartureCodeText.Text = _assignment.From;
            ArrivalCodeText.Text = _assignment.To;
            AssignmentSyncText.Text = $"{_assignment.FlightNumber} synced from BAV website";
            StartFlightButton.IsEnabled = _session is null;
            AddEvent("Assignment sync", $"Loaded {_assignment.FlightNumber} {_assignment.From}–{_assignment.To}");
        }
        catch (Exception ex)
        {
            AssignmentSyncText.Text = "Sync failed";
            AddEvent("Website warning", FriendlyError(ex));
        }
    }

    private void RefreshSimulatorDetection()
    {
        foreach (var simulator in _simulators) simulator.RefreshDetection();
        var detected = _simulators.FirstOrDefault(item => item.IsDetected);
        if (detected is not null && _session is null)
            SimulatorCombo.SelectedItem = detected;

        if (detected is null)
        {
            SimulatorStatusText.Text = "Not detected";
            DetectedSimulatorText.Text = "Waiting for X-Plane 12 / MSFS";
            NativeTelemetryText.Text = "Choose an adapter manually for website-pipeline testing.";
            return;
        }

        SimulatorStatusText.Text = "Detected";
        DetectedSimulatorText.Text = detected.DisplayName;
        NativeTelemetryText.Text = detected.HasNativeTelemetry
            ? "Native simulator telemetry connected"
            : "Simulator process detected · v1.0 website test bridge active until the native telemetry module is installed.";
    }

    private async void StartFlight_Click(object sender, RoutedEventArgs e)
    {
        if (_assignment is null || SimulatorCombo.SelectedItem is not ISimulatorAdapter simulator) return;
        StartFlightButton.IsEnabled = false;
        try
        {
            AcarsStatusText.Text = "Starting…";
            _session = await _api.StartSessionAsync(simulator.Id);
            _flightStarted = DateTimeOffset.UtcNow;
            _packets = 0;
            _paused = false;
            _queue.RemoveOtherSessions(_session.Id);
            SessionIdText.Text = _session.Id[..Math.Min(8, _session.Id.Length)];
            AcarsStatusText.Text = "Connected";
            TelemetrySourceText.Text = simulator.HasNativeTelemetry ? "Native simulator telemetry" : "Development telemetry bridge · backend and PIREP pipeline are live";
            PirepStatusText.Text = "Automatic upload armed";
            EndFlightButton.IsEnabled = true;
            PauseButton.IsEnabled = true;
            PauseButton.Content = "Ⅱ  Pause tracking";
            _telemetryTimer.Start();
            AddEvent("Flight started", $"ACARS session {_session.Id[..Math.Min(8, _session.Id.Length)]} created");
            AddEvent("Simulator", $"{simulator.DisplayName} selected");
            await TelemetryTickAsync();
        }
        catch (Exception ex)
        {
            AcarsStatusText.Text = "Start failed";
            StartFlightButton.IsEnabled = true;
            MessageBox.Show(FriendlyError(ex), "BAV ACARS", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async Task TelemetryTickAsync()
    {
        if (_sending || _paused || _session is null || _flightStarted is null || SimulatorCombo.SelectedItem is not ISimulatorAdapter simulator) return;
        _sending = true;
        try
        {
            var elapsed = DateTimeOffset.UtcNow - _flightStarted.Value;
            var totalMinutes = ParseDurationMinutes(_assignment?.Duration) ?? 480;
            var progress = Math.Clamp(elapsed.TotalMinutes / totalMinutes, 0, 1);
            var payload = simulator.CreateDevelopmentTelemetry(progress, elapsed);
            UpdateTelemetryUi(payload, elapsed, progress);

            try
            {
                await FlushQueueAsync(_session.Id);
                await _api.SendTelemetryAsync(_session.Id, payload);
                _packets++;
                PacketsText.Text = _packets.ToString("N0");
                LastUpdateText.Text = "Updated just now";
                AcarsStatusText.Text = "Connected";
                FooterStatusText.Text = $"●  ACARS connected  ·  {simulator.DisplayName}  ·  {_assignment?.FlightNumber}";
            }
            catch
            {
                _queue.Enqueue(_session.Id, payload);
                AcarsStatusText.Text = "Reconnecting";
                LastUpdateText.Text = "Tracking locally";
                FooterStatusText.Text = "●  BAV server unavailable · flight tracking continues locally";
            }
            QueueText.Text = _queue.CountFor(_session.Id).ToString();
        }
        finally
        {
            _sending = false;
        }
    }

    private async Task FlushQueueAsync(string sessionId)
    {
        while (_queue.TryPeek(sessionId, out var payload))
        {
            await _api.SendTelemetryAsync(sessionId, payload!);
            _queue.Dequeue(sessionId);
        }
    }

    private void UpdateTelemetryUi(TelemetryPayload payload, TimeSpan elapsed, double progress)
    {
        AltitudeText.Text = payload.AltitudeFt >= 18000 ? $"FL{payload.AltitudeFt / 100:000}" : $"{payload.AltitudeFt:N0} ft";
        AltitudeSubText.Text = $"{payload.AltitudeFt:N0} ft";
        GroundSpeedText.Text = $"{payload.GroundSpeedKt:N0} kt";
        VerticalSpeedText.Text = $"{payload.VerticalSpeedFpm ?? 0:N0} fpm";
        HeadingText.Text = $"{payload.HeadingDeg:N0}°";
        FuelText.Text = payload.FuelKg is null ? "—" : $"{payload.FuelKg:N0} kg";
        FlightTimeText.Text = $"{(int)elapsed.TotalHours:00}:{elapsed.Minutes:00}";
        RouteProgress.Value = progress * 100;
        var phase = DeterminePhase(progress, payload);
        FlightPhaseText.Text = phase;
        RouteDetailText.Text = $"{progress * 100:N1}% complete · Last position {payload.Latitude:F3}, {payload.Longitude:F3}";
    }

    private async void EndFlight_Click(object sender, RoutedEventArgs e)
    {
        if (_session is null) return;
        var result = MessageBox.Show("End this ACARS session and submit the automatic PIREP to BAV?", "End flight", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result != MessageBoxResult.Yes) return;
        EndFlightButton.IsEnabled = false;
        _telemetryTimer.Stop();
        try
        {
            await FlushQueueAsync(_session.Id);
            await _api.EndSessionAsync(_session.Id, -150, "Submitted automatically by FreeFlight BAV ACARS v1.0 desktop client.");
            AddEvent("Flight complete", "Automatic ACARS PIREP submitted to BAV Operations");
            PirepStatusText.Text = "Submitted · pending staff review";
            AcarsStatusText.Text = "Completed";
            FlightPhaseText.Text = "BLOCK ON";
            FooterStatusText.Text = "●  Flight complete · PIREP submitted";
            _queue.RemoveSession(_session.Id);
            _session = null;
            _flightStarted = null;
            PauseButton.IsEnabled = false;
            StartFlightButton.IsEnabled = false;
            await SyncAssignmentAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show(FriendlyError(ex), "Could not end flight", MessageBoxButton.OK, MessageBoxImage.Warning);
            EndFlightButton.IsEnabled = true;
            _telemetryTimer.Start();
        }
    }

    private void Pause_Click(object sender, RoutedEventArgs e)
    {
        _paused = !_paused;
        PauseButton.Content = _paused ? "▶  Resume tracking" : "Ⅱ  Pause tracking";
        AcarsStatusText.Text = _paused ? "Paused" : "Connected";
        AddEvent(_paused ? "Tracking paused" : "Tracking resumed", "Pilot action");
    }

    private async void RefreshAssignment_Click(object sender, RoutedEventArgs e) => await SyncAssignmentAsync();
    private void DetectSimulator_Click(object sender, RoutedEventArgs e) => RefreshSimulatorDetection();
    private void SimulatorCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SimulatorCombo.SelectedItem is ISimulatorAdapter simulator)
            DetectedSimulatorText.Text = simulator.IsDetected ? $"{simulator.DisplayName} detected" : $"{simulator.DisplayName} selected";
    }

    private void WebsiteNav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string path }) OpenUrl(_api.UrlFor(path));
    }

    private void Dashboard_Click(object sender, RoutedEventArgs e) { }

    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        LoginStatus.Text = _api.IsAuthenticated ? "Reconnect or switch BAV account. Your password is never stored." : "Configure your BAV website connection.";
        LoginOverlay.Visibility = Visibility.Visible;
    }

    private void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { }
    }

    private void AddEvent(string name, string detail)
    {
        _events.Insert(0, new EventLogItem(DateTimeOffset.Now, name, detail));
        while (_events.Count > 30) _events.RemoveAt(_events.Count - 1);
    }

    private static string DeterminePhase(double progress, TelemetryPayload payload)
    {
        if (payload.OnGround && progress < .01) return "PREFLIGHT";
        if (progress < .03) return "TAXI OUT";
        if (progress < .08) return "CLIMB";
        if (progress < .78) return "CRUISE";
        if (progress < .94) return "DESCENT";
        if (progress < .99) return "APPROACH";
        return payload.OnGround ? "TAXI IN" : "LANDING";
    }

    private static double? ParseDurationMinutes(string? duration)
    {
        if (string.IsNullOrWhiteSpace(duration)) return null;
        var hours = 0d;
        var minutes = 0d;
        foreach (var token in duration.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (token.EndsWith('h') && double.TryParse(token[..^1], out var h)) hours = h;
            if (token.EndsWith('m') && double.TryParse(token[..^1], out var m)) minutes = m;
        }
        var total = hours * 60 + minutes;
        return total > 0 ? total : null;
    }

    private static string FriendlyError(Exception ex)
    {
        var message = ex.Message.Replace("{\"error\":\"", "").Replace("\"}", "");
        return message.Length > 240 ? message[..240] : message;
    }
}
