# FreeFlight BAV ACARS v0.1

This is the first BAV-only ACARS client scaffold. It exists to exercise the real BAV backend now, before the simulator adapters are connected.

Supported adapter targets:
- X-Plane 12
- Microsoft Flight Simulator 2020
- Microsoft Flight Simulator 2024

The backend contract is intentionally simulator-agnostic. Each simulator adapter will normalize its native SDK/datarefs/SimConnect values into the same telemetry payload.

## Run the test client

1. Start the BAV website locally.
2. Log in on the website and book a flight.
3. From the repository root run:

```powershell
dotnet run --project clients/bav-acars/BavAcars.Client.csproj
```

4. Enter the BAV site URL, pilot email and password.
5. Pick X-Plane 12, MSFS 2020 or MSFS 2024.
6. The v0.1 test client starts a real ACARS session and sends synthetic telemetry every five seconds.
7. Staff can watch the session at `/staff/live-operations`.
8. Press Enter in the client to end the flight. The backend automatically creates a pending ACARS PIREP for staff review.

## Next adapter milestone

Replace the synthetic telemetry loop with three adapters behind one interface:

- `XPlane12Adapter`: X-Plane SDK/plugin or local bridge/datarefs.
- `Msfs2020Adapter`: SimConnect.
- `Msfs2024Adapter`: SimConnect/2024-supported SDK path.

The adapters should only gather simulator data. Authentication, assignment retrieval, telemetry transport, reconnect queueing, session lifecycle and PIREP submission stay shared.

This client is exclusively for British Airways Virtual and is not a multi-VA platform.
