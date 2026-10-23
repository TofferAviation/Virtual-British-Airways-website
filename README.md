
# British Airways Virtual website

## BA-Radar Earth renderer

The globe uses WGS84 with one render unit per kilometre. See
`src/lib/radar-globe-geodesy.ts` for the coordinate convention and solar
ephemeris. The surface, clouds, atmosphere and aurora share Earth-fixed
coordinates and one solar direction. Flight and controller selection, route
tracks and replay remain connected to the existing BA-Radar data.

The surface renderer requests geographic quadtree patches through
`/api/radar/imagery`, with screen-size LOD, horizon culling, six concurrent
surface requests, parent retention until child images arrive, retries and GPU
texture disposal. Two inspected NASA base tiles are bundled so the globe has
real geography even when NASA is unavailable. Imagery is cached for one day
upstream and up to seven days at the CDN. The allowlist contains only:

- NASA GIBS `BlueMarble_NextGeneration`, cloud-free historical surface mosaic.
- NASA GIBS `VIIRS_CityLights_2012`, historical night-light composite. It is
  **not** current city radiance or live power-outage data.

Attribution: NASA GIBS / Blue Marble / Suomi NPP VIIRS. API and projection
documentation: https://nasa-gibs.github.io/gibs-api-docs/access-basics/ .
No Google, licensed commercial imagery, paid API or provider credential is used.

Cloud cover is the existing NOAA GFS 0.25-degree analysis. Its low/middle/high
coverage and pressure-level geopotential heights constrain a Cartesian 3D
gradient/cellular density field. The pressure levels are **not measured cloud
base/top**: their heights approximate MSL and do not incorporate a local
geoid/terrain clearance correction. Individual billows, opacity and vertical
profiles are inferred. The cloud shader integrates extinction and a lighting
approximation; ground shadows sample the same field along the Sun direction.
Ray integration uses bounded, deterministic midpoint samples, not animated
screen-space jitter. Mipmapped 3D noise is explicitly filtered to the pixel
footprint. The former height-column/surface-normal approximation has been
replaced by 64-cubed RGBA mass noise and 32-cubed multiscale erosion. Regional
banks organise the 3D lobes; low, middle and high cloud have different profiles.
Coverage-to-density calibration is nonlinear and approximate, not a guarantee
that the rendered areal percentage exactly equals a GFS grid-cell percentage.
Solar optical depth, dual-lobe phase and reduced-extinction scattering terms
supply volumetric shading. Air extinction/scatter is evaluated to each cloud's
weighted distance and to terrain, rather than tinting both under a blue shell.
There is no fabricated observed hurricane, measured cloud liquid water or
global satellite cloud-height reconstruction.

Aurora uses the existing five-minute cached NOAA SWPC OVATION feed:
https://services.swpc.noaa.gov/json/ovation_aurora_latest.json . The verified
schema is `[Longitude, Latitude, Aurora]`, with geographic coordinates. The
renderer derives a smooth strongest-sector curve in each hemisphere without
applying another magnetic-coordinate rotation. Emission is placed at 90–360 km
above WGS84, with approximate green, red and nitrogen vertical profiles,
procedural folds/rays and daylight suppression. Those details and altitudes
are inferred presentation, not quantities observed by OVATION. Forecast time
and stale status appear in the globe controls. NOAA product description:
https://www.spaceweather.gov/products/aurora-30-minute-forecast .

Atmospheric limb optics use a small exponential-density optical-depth
integration with approximate colour/phase terms. This is not a calibrated
spectral Rayleigh/Mie multiple-scattering solution.

### Local verification

Run `npm run test:globe`, `npm run test:clouds`, `npm run typecheck` and
`npm run build`. `/dev/globe` is a development-only visual-check page, with
fixed date/camera presets for day, north, south, night, cloud, close, flight,
cumulus and limb views. The flight preset uses GFS above land. The cumulus
preset is an explicitly labelled synthetic calibration (58% input coverage,
1.2–5 km model band), never an observed cloud field or production fallback.
The close preset is an oblique orbital view. Shift-drag tilts the live camera;
wheel zoom uses bounded altitude targets and frame-rate-independent damping.
The minimum altitude is 4 km; tilt changes view direction without lowering
the camera. Back-face volume integration supports cameras inside the cloud
and atmosphere shells. Close-range integration has a 300 km distance limit.
Adaptive clipping and exclusive parent/child tile visibility prevent orbital
depth fighting between terrain and the cloud volume.
The page returns 404 in production. Apart from the labelled cumulus fixture,
weather remains live, so these are not weather-snapshot screenshot regressions.
Shader compilation failures and renderer diagnostics are shown on that page.
For a second local server in PowerShell, use
`$env:BAV_GLOBE_QA='1'; npm run dev -- --hostname 127.0.0.1 --port 3107`.

### Remaining stages and acceptance limits

This renderer is a repair/reconstruction stage, not a completed photorealistic
Earth digital twin. DEM terrain, seasonal/time-aware source selection,
commercial-provider configuration, satellite cloud-top ingestion, cloud
wind advection, weather-time interpolation, temporal reprojection, calibrated
atmospheric scattering, bloom and measured desktop/mobile GPU performance
remain unimplemented. Tile handoff currently waits for all child images; it
does not cross-fade them. Ground imagery LOD is capped at level 6. No 60/30 FPS
claim is made without profiling. Local GPU visual checks cover orbital and
close-up and flight-level cloud views, but the photographic visual target is
not yet accepted. In particular, fine turbulent detail, local weather-type
classification and cloud morphology still require visual development.

## Production login-session recovery

If pilots are redirected back to login or see an invalid-session message immediately after a domain or deployment change:

1. Confirm the Render service has both the root domain and `www` domain verified with certificates issued.
2. Keep `BAV_PILOT_SESSION_SECRET` and `BAV_STAFF_SESSION_SECRET` stable. Do not rotate either value as part of ordinary recovery, because doing so invalidates every current login session.
3. Set `BAV_PUBLIC_SITE_URL` to the live canonical HTTPS domain. The current production value is `https://virtualairline.co.uk`.
4. Confirm `pilotSessionCookieDomain` accepts the live root domain and its `www` hostname. The session-cookie version must be increased when correcting a domain-scope issue so browsers receive a fresh cookie and earlier variants are cleared at the next sign-in.
5. After the deployment is live, ask affected pilots to sign in again in a private window or after clearing cookies for the live domain.

The current recovery was released in commit `90ccb14` (`fix: scope pilot sessions to live domain`). It creates `bav_pilot_session_v6`, clears prior cookie variants during sign-in, and safely shares the session between `virtualairline.co.uk` and `www.virtualairline.co.uk`.
