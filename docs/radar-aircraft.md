# Globe aircraft and altitude tracks

3D model release, 24 October 2026. Confirm the deployed revision at
`/api/health`: this update's `globeRevision` is `airframe-model-lods-v2-20261024` and
`releaseCommit` reports the Render Git commit when available.

## 3D airframes at map scale

The previous model-only-when-close gate has been replaced. Every supported,
loaded type now uses a matching 3D airframe at ordinary map zoom too. The 14
map meshes derive from their corresponding detailed models, not a generic
jet stretched to different sizes. They total approximately 2 MB, have baked
vertex colours, one opaque material/draw per aircraft, and no texture/decoder
dependencies. Most have approximately 2,400 triangles; the topology-heavy
A380 has 10,399. Full textures/geometry load only at 64 natural screen pixels.
Downloads remain visibility-driven, selected-first and bounded to two; the
detailed six-type shared LRU cache is retained. No new dependency is added.

Map models remain readable at 44 selected / 30 other CSS pixels. Their centres
and true-heading frames still use actual telemetry. Only display size is
enlarged, and it converges continuously to 1 metre = 0.001 render kilometres.
At enlarged scale they render in a separate, centre-horizon-culled 3D marker
pass after the world, rather than intersecting the Earth or falsely blocking
volumetric clouds as giant physical aircraft. At true scale, aircraft rejoin
world and cloud-depth passes. Hidden LODs are excluded from picking. Unsupported
types or failed/pending assets retain a generic/temporary marker; dedicated
assets are not claimed for every possible ICAO type. Existing family/livery
limitations below remain explicit.

`npm run aircraft:lod` regenerates `public/models/aircraft/lod/` offline from
the unchanged detailed assets using Three.js's bundled meshoptimizer. The
recipe and original corresponding editable sources are publicly available;
these derived meshes retain the original GPLv2 asset licence. No FSLTL assets
are used. The local `traffic` QA preset has five explicitly synthetic, mixed
airframes; no test traffic is inserted into the website's live database/feed.

New tests cover orbit-to-close-up scale continuity, horizon culling, lazy and
bounded loading, actual map/detail switching, unchanged position, shared mesh
reuse, disposal during loading, every generated GLB and the offline recipe.
All 123 regression tests, typecheck, full ESLint (zero errors; 30 existing
warnings) and production build pass (nine existing tracing warnings). Browser
QA displayed five different map LODs, selected the A320 by clicking its mesh,
and loaded its detailed close-up at the reported 29,000 ft. The A380 close-up
also loaded correctly. No aircraft asset load failures were reported. The
five-aircraft map snapshot held its 60 fps cap on this machine; this is not
a low-end hardware or heavy-traffic guarantee. The user requested release of
the models first, retaining house liveries while they work on BA paintwork.

- The previous 22 km-radius / 65 km-tall cone is removed. Aircraft
  use type-matched 3D LODs. Nearby aircraft load a matching
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

## Earlier aircraft-integration checks (before the map LOD update)

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
