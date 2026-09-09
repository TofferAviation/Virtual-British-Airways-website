# FreeFlight BAV ACARS v1.0

Windows desktop ACARS client for British Airways Virtual. This app is BAV-only and talks directly to the website's `/api/acars/v1` endpoints.

## What v1.0 does

- Native graphical Windows client (WPF / .NET 8)
- Signs in with the pilot's BAV website account
- Pulls the pilot's current BAV flight assignment
- Detects X-Plane 12, MSFS 2020 and MSFS 2024 processes
- Starts and ends real BAV ACARS sessions through the website API
- Streams telemetry to Staff Live Operations
- Maintains a local reconnect queue if the website is temporarily unavailable
- Automatically creates the ACARS PIREP when the session is ended
- Opens BAV PIREPs, assignments, fleet and support pages from the app

## Simulator telemetry status

The desktop application and website session pipeline are functional in v1.0. The simulator adapter boundary is also in place for X-Plane 12, MSFS 2020 and MSFS 2024.

The first v1.0 build uses the **development telemetry bridge** after simulator/process detection so the complete website -> ACARS -> Live Operations -> automatic PIREP workflow can be tested immediately. Native X-Plane datarefs/UDP and Microsoft SimConnect telemetry adapters are the next implementation layer and can replace the bridge without changing the BAV API or desktop UI.

The app explicitly shows which telemetry source is active so development telemetry cannot be mistaken for simulator telemetry.

## Run on Windows

```powershell
Set-Location "D:\Virtual British Airways files"
dotnet run --project clients/bav-acars/BavAcars.Client.csproj
```

Book a flight on the website before pressing **Start flight** in ACARS.

## Build a Windows executable

```powershell
dotnet publish clients/bav-acars/BavAcars.Client.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Published output will be under:

```text
clients\bav-acars\bin\Release\net8.0-windows\win-x64\publish\
```

## Local data

The app stores only non-secret connection preferences (website URL and pilot email) in `%APPDATA%\FreeFlight\BavAcars`. Passwords are never persisted. Unsent telemetry is journaled under `%LOCALAPPDATA%\FreeFlight\BavAcars` so a short website/network interruption does not lose the current flight's queued packets.
