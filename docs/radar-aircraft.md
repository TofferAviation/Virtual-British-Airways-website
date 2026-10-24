# Globe aircraft and altitude tracks

Release candidate, 24 October 2026. Confirm the deployed revision at
`/api/health`: `globeRevision` is `aircraft-altitude-v1-20261024` and
`releaseCommit` reports the Render Git commit when available.

- The previous 22 km-radius / 65 km-tall cone is removed. Distant aircraft
  use original type-proportioned silhouettes. Nearby aircraft load a matching
  metre-scale glTF 2.0 model, with true-heading orientation in a local WGS84 frame.
- The selected-flight caption exposes **View aircraft · reported altitude**.
  It places the eye 250 m above and 200 m behind the reported position.
- Fourteen fleet models are available; assets load only on demand, with at
  most two pending requests and a six-type shared LRU cache. Static mesh parts
  are batched by material; default poses and mirrored winding are preserved.
- All aircraft and replay heights use reported feet × 0.3048. There is no
  15 km minimum aircraft height or fixed-height replay sphere. The durable
  public track projection now retains altitudeFt, which storage already held.
- Recorded tracks interpolate measured height, with green/blue/violet altitude
  colours and a translucent reference-surface curtain. Missing height breaks
  the path. Planned routes remain separately dashed; they are not measured
  altitude profiles. Camera clipping and cloud depth account for nearby models.

## Asset provenance

No FSLTL/MSFS assets are used. Assets come from Flightradar24/fr24-3d-models,
revision dd53267690c6a4ecbb290a3acf0284333a5d68a9, credited upstream to
FlightGear/FGMEMBERS authors. The aircraft assets are GPLv2, including converted
versions. Full editable sources, original packages, licence and notices ship
under public/models/aircraft; SOURCES.html is a public source-download index.
The 35.9 MB rendered fleet is lazy-loaded, not downloaded as one fleet bundle.
Editable sources account for most of the approximately 140 MB on disk.

`npm run aircraft:import` reproduces the offline glTF 1→2 conversion using the
pinned development-only gltf-pipeline 4.3.1 dependency. Original Git blob hashes
are verified. Model sources are never executed. House liveries are retained;
these are not British Airways liveries. Neo/ER family substitutions are labelled.
Unknown types remain generic aircraft markers. Pitch, bank and gear states are
not measured/animated. Pressure/geoid corrections are not applied to reported
altitude; this is visualisation, not navigation-grade positioning.

## Checks and remaining visual approval

- `npm run test:aircraft`: 10 tests, including actual fleet geometry parsing and
  batching, physical units, orientation, altitude, resource packaging and replay.
- `npm run test:globe-integration`: 5 tests; `npm run test:globe`: 58 tests;
  `npm run test:satellite-clouds`: 27 tests.
- Typecheck and changed-file ESLint passed. Production build passed outside the
  filesystem sandbox (Turbopack needs normal junction-creation permissions),
  retaining nine pre-existing filesystem-tracing warnings.
- Browser access to the local tab was denied by the browser tool policy. No
  visual screenshot approval is claimed. The development-only `/dev/globe` page
  has **traffic** and **aircraft** views, clearly labelled synthetic.
- The local preview uses 127.0.0.1:3107; run outside the restricted runner with
  a clean generated cache if Turbopack cannot create its junctions.
- User-approved security updates: Next.js / eslint-config-next 16.4.1,
  MapLibre 6.4.1, Nodemailer 10.1.4, Sharp 0.35.5, source-map-js 1.2.2 and
  Zod 4.6.7. npm audit reports zero vulnerabilities after these updates.
  MapLibre's legacy fallback explicitly sets the new ESM worker URL. The live
  Three.js globe, BA database connection and login/session settings are retained.
- The upgraded React lint rules also required lifecycle-only compatibility
  fixes in the legacy radar, crew-room UI and finance/mentoring display code.
  Camera snapshots are captured on view changes (not every animation frame),
  replay completion is derived, and chat data is scoped to its room. No database
  schema, authorisation, financial calculation or mentoring policy is changed.
  Website CI now installs the exact lockfile and runs all 109 regression tests.
