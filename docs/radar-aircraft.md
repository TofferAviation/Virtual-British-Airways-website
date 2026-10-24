# Globe aircraft and altitude tracks

3D model release, 24 October 2026. Confirm the deployed revision at
`/api/health`: this update's `globeRevision` is `airframe-model-lods-v2-20261024` and
`releaseCommit` reports the Render Git commit when available.

## Cosmetic contrails

Contrails are an optional visual effect, on by default with a **Contrails ·
visual effect** checkbox in the globe caption. Formation does not depend on
weather, satellite observations, humidity or temperature. Moving supported
aircraft emit two or four streams from model-specific, approximately calibrated
engine positions. As a cosmetic rule, emission requires engines running,
airborne status and a displayed reported height of at least 6,000 m. Unknown
airframes and scrubbed replay markers do not emit guessed engine trails.

The existing buffered/smoothed aircraft pose drives each live tip. Available
measured display history seeds the initial wake without inventing a straight
line; stale/relocated/disconnected history is excluded. Older knots remain
Earth-fixed. Shader-driven widening, soft billows, slow synthetic drift, solar
tint, atmospheric haze and age fading give the effect its appearance. Bounded
midpoint interpolation rounds the cosmetic wake without changing aircraft
telemetry or stored tracks. Holds stop spawning; teleports, tab suspensions,
emission gaps and missing flights cannot produce huge connecting streaks.

Low / Medium / High / Ultra cap nearby selected-first aircraft at 4 / 8 / 16 /
24 and lifetime at 18 / 30 / 45 / 60 seconds. Each aircraft has one reusable
mesh/draw, at most 127 stored knots and twice-subdivided ribbon geometry for
all engines. Knots update at 1 / 0.6 / 0.5 / 0.5 seconds, while only the live
midpoint/tip uploads every frame. No added texture/model downloads, particle
objects or per-frame React state updates are needed. Disabling the effect or
downshifting quality releases allocations. Trails fade by 1,200 km range and
never inherit the kilometre-sized display scale of distant aircraft markers.

The separate transparent world-space pass respects terrain/airframe depth
and the ellipsoid horizon. A bounded 3–8 foreground-cloud density probe on
trail pixels approximates cloud occlusion; it is not a full scattering
simulation. It does not add contrails to the main volume/shadow/depth field or
invalidate its cache. Existing cloud appearance and source constraints remain
unchanged. Close-up size boosts affect only the fresh visual engine attachment.

Development-only `contrails` and `contrails-clouds` presets exercise two-/four-
engine aircraft and a separately labelled synthetic cloud layer below them.
No test aircraft enter the live feed/database. Automated checks include buffer
reuse/limits, 30/60/144 fps, eligibility, smoothing history, removal/disposal,
stale holds, teleports, engine counts and render-pass separation.

Local verification: all 144 regression tests, TypeScript, changed-file ESLint
and the production build pass. Browser QA checked the effect on/off (zero
trail allocations when off), Low and High profiles, two/four engine streams,
clouds below the aircraft and source switching including unknown satellite
coverage. No shader errors were reported. The two-aircraft tests retained
their 30 / 45 / 60 fps profile caps on this machine after loading; this is not
a guarantee for heavy traffic or low-end hardware. The user approved release
on 24 October 2026; confirm the deployed Git revision via `/api/health` →
`releaseCommit`.

## Continuous live aircraft motion

The globe no longer assigns a new transform only on the five-second API poll.
Each aircraft keeps at most 64 timestamped reports and interpolates position,
reported altitude and shortest-path heading in the existing render loop. A
15-second display buffer covers normal telemetry/poll jitter; this is a delayed
visualisation, not a new live location measurement. Geographic interpolation
preserves altitude above the WGS84 surface and takes the short dateline route.
There is no per-packet ease-to-stop, dead reckoning or invented track data.
If the buffer runs out, the marker holds at the last measurement. Late packets
resume continuously, with a bounded ±10% playback correction to recover drift.
Duplicates, selection-only refreshes and out-of-order packets do not rewind it.
Long gaps / simulator relocations reset rather than inventing a flight path;
background tabs resume at buffered time. Replay scrubbing stays immediate.

The existing View aircraft control frames the displayed/interpolated pose so
it does not aim several kilometres ahead of the visible model. Sidebar data,
recorded tracks, storage and the public API remain authoritative and unchanged.
No scene remounts, React per-frame updates or asset reloads are introduced.
Moving visible world-scale models invalidate cloud depth to avoid a stale
silhouette; distant overlay traffic retains the cached cloud pass. Close-up
movement uses the existing cheaper moving-cloud resolution.

Development-only `aircraft-motion` provides five-second synthetic observations
of a ~430 kt circuit, with interpolated heading/climb. It never enters the live
feed/database. Automated checks cover 30/60/144 fps, steady cadence with jitter,
duplicates, north/dateline crossings, height, stale/invalid packets, ground
holds, reconnects, replay, resource reuse and physical-only cloud invalidation.
All 133 regression tests, TypeScript and changed-file ESLint pass. The production
build passes with the same nine existing filesystem-tracing warnings. This
follow-up was approved for release on 24 October 2026. Verify the deployed
Git SHA through `/api/health` → `releaseCommit`.

## Selected aircraft close-up size

The selected airframe now defaults to a 175% visual size nearby. A Close-up
size slider below View aircraft offers 100–250% in 25% steps; 100% restores
the previous true-size close-up. A smoothstep blends the extra size between
15 km and 500 m of camera/aircraft range, without changing distant map sizes
or unselected traffic. The same factor is applied to both mesh LODs, and
detailed geometry is requested according to the boosted natural pixel size.
No asset, texture, livery, reported position, heading or altitude is modified.
Nearby models retain world/cloud depth; the boost does not convert them to
always-visible map overlays. Changing the slider invalidates cached cloud
depth without rebuilding the scene, moving the camera or reloading assets.

Regression checks cover continuous/monotonic zoom sizing, clamped finite
limits, unchanged distant/other aircraft, true-size restoration, original
reported coordinates and shared geometry. Browser comparison at 100% and
175% used the same A380/camera pose and retained the 60 fps cap on this
machine. The user approved deployment of this size follow-up after local
review; verify the exact deployed Git SHA using `releaseCommit` above.

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

At distant map scales, models remain readable at 44 selected / 30 other CSS pixels. Their centres
and true-heading frames still use actual telemetry. Only display size is
enlarged; at 100% close-up size it converges continuously to 1 metre = 0.001 render kilometres.
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
