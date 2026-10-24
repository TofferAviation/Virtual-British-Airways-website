# Satellite-observed Live clouds

Live cloud locations are anchored to satellite observations. The user authorised an explicitly labelled **boundary-uncertainty band up to 10 km** on 24 October 2026; this limited reconstruction is not a new detection. Production reads a validated, compressed public observation asset prepared separately by the repository's GitHub Actions workflow; Render does not decode native satellite files.

## Rules

- ACMF's good-quality four-level mask determines the original detection. Raw clear/uncertain/unknown classifications remain unchanged. Outside the user-authorised 10 km boundary band, they have exactly zero rendered extinction. Within the band, only a neighbouring usable observation can support an explicitly labelled estimated fringe.
- CODF supplies optical depth only when its retrieval is good-quality; ACHAF supplies cloud-top geopotential height only when good-quality. Missing/degraded retrievals are not replaced with made-up optical depth or tops. A mask can report cloud while its volume remains unknown/unrendered.
- Cloud base, full thickness and sub-grid formation geometry are estimated. Optical depth/top in an estimated fringe are extrapolated from nearby usable retrievals, not new measurements. These are not measurements of overlapping/hidden cloud layers.
- Procedural noise supplies detail only inside the reconstructed, bounded formation. An independent distance-to-usable-observation gate limits the fringe even after filtering. The same gates govern ground shadows.
- GFS is a motion prior, never a cloud-location or unknown-area fallback.

## Coverage and navigation

The first provider ingests public NOAA GOES-19/East and GOES-18/West full-disk ACMF, CODF and ACHAF NetCDF4 products. It uses each file's packed coordinate scales/offsets, actual perspective height, ellipsoid axes, projection-origin longitude, sweep axis, fill values and quality flags. Products are matched to the same scan and sampled on their own grids. Processing revisions of one scan do not count as consecutive observations.

Output is a north-first, cell-centred geographic grid with no duplicated dateline or pole row. The default 0.2° display grid is a performance choice, **not the native satellite resolution**. Optional 0.1° output increases memory/transfer costs. Categorical masks remain nearest-neighbour and unmodified; only the separate estimated formation field is filtered. Multi-satellite overlap selects the usable view with the lower local zenith angle. Views beyond 70° local zenith are excluded, not stretched to fill the rest of Earth.

GOES is **not a global provider**. Much of Europe, Africa, Asia and the polar regions remains unknown. Nominal ABI ellipsoid navigation is used; a full cloud-parallax correction is not implemented. More regional/global observations require separately verified providers; neither NASA daytime photographs nor GFS coverage silently fills these gaps.

## Motion

The ingester compares two synchronized consecutive mosaics. A bounded patch matcher uses real cloud-mask/optical-depth structure and existing GFS surface/FL180/FL300 winds as height-selected priors where available. Low-confidence matches retain the labelled wind prior; missing wind/transport evidence does not grant a development classification. Newly detected cover over a confidently clear previous neighbourhood, not explained by the estimated transport, is flagged developing. This is an inference, not a direct measurement of condensation or a high-resolution optical-flow solver.

The shader blends corresponding retrieved column properties over 12 seconds, constrained by the **latest observation and its bounded reconstructed fringe**. A new clear/unknown report removes the old field immediately while the replacement is prepared; it is not blended with historical support. A remaining fringe must be newly justified by a current neighbouring usable observation within 10 km. Subpixel structures and their movement are not claimed as observed. Source scan times are retained per satellite; the composite timestamp is the latest scan end.

## Run ingestion locally

Requires a current Node 22 runtime with native TypeScript stripping (22.18+), or newer, and `npm ci`. The pinned `h5wasm` decoder runs only in the ingestion process, never in a viewer's browser.

```powershell
$env:BAV_CLOUD_WIND_ORIGIN = 'http://127.0.0.1:3107'
npm run clouds:ingest
```

For a continuously refreshed local preview, run `npm run clouds:watch` in one separate process. It waits five minutes between completed ingestion runs; the satellites' scan/product latency still determines observation age. Use only one ingester for a given output file. `npm run clouds:ingest -- --inspect` prints actual source metadata for diagnosis.

Configuration:

| Setting | Meaning |
| --- | --- |
| `BAV_SATELLITE_CLOUD_FILE` | Absolute/shared JSON output path; default `.bav-data/satellite-clouds/latest.json`. The web server and ingester must use the same file. |
| `BAV_CLOUD_WIND_ORIGIN` | Trusted website origin serving the existing public `/api/radar/wind-grid` endpoint. No account key or pilot data is sent. Missing wind fields are recorded, not fabricated. |
| `BAV_SATELLITE_STEP_DEG` | `.1`, `.2` (default), `.25` or `.5`. This resamples observations; it cannot add native sensor detail. |

The ingester downloads original public NOAA files into the ignored `.bav-data/satellite-clouds/raw` cache, retains three hours of its own named source files, and atomically replaces the validated JSON artifact. It does not write satellite data into Git/public assets, touch ACARS or call pilot/staff write APIs. Failed ingestion does not replace a verified artifact with manufactured data.

## Serving and deployment prerequisites

In production, `/api/radar/clouds` reads `latest.json.gz` from the dedicated `bav-satellite-observations-v2` prerelease in the existing public repository. A server-side cache and shared in-flight request limit reads to once per minute per server instance. Downloads are bounded to 8 MiB compressed / 120 MiB expanded, time-limited, decompressed and fully validated before use. The download contains public NOAA observations only. No host secret or pilot data is involved. An explicit `BAV_SATELLITE_CLOUD_FILE` overrides the hosted feed for a separately operated file-based installation; development continues using the local artifact.

Web requests do not download or decode large NetCDF files. File validation, gzip transport and GPU textures are reused for unchanged observations. An unchanged refresh does not reset the visual transition. The client polls once per minute.

Both the API and renderer expire observations after 35 minutes, based on the contributing source scan ends. No stale-while-revalidate cloud fallback is allowed. No usable artifact produces a successful explicit **unknown** field, not a clear-sky claim. A fetch failure clears the active cloud field rather than preserving ghost clouds indefinitely. The interface reports geographic unknown coverage, retrieval reconstruction availability and the state below the camera.

The `Satellite cloud observations` workflow runs on a standard Ubuntu runner in the existing **public** GitHub repository, targeting every ten minutes at minutes 7/17/27/37/47/57 UTC, on relevant main-branch changes and via manual dispatch. It uses the built-in short-lived `GITHUB_TOKEN` with `contents: write` only for its publishing job, not a new persistent API key. Actions are pinned to inspected official commit SHAs; fork runs are disabled. Native HDF5 processing runs there, never in Render. A local ingestion run peaked at about 308 MiB RSS; runner Linux usage can differ.

Only the validated compressed `latest.json.gz` asset is replaced in the marked, dedicated prerelease. Raw satellite files never enter Git history or release assets. The publisher refuses an unmarked release, a draft or an ordinary software release. The prerelease is not marked as the repository's latest software release. Failed ingestion/validation does not upload anything. It does not add a paid Render worker, persistent disk, larger GitHub runner, artifact/cache storage or provider account; Render's start command remains unchanged. GitHub's standard public-repository runners are free under its current policy; making the repository private or selecting paid runners changes that assumption.

This is a best-effort data schedule, not a freshness SLA: GitHub can delay/drop scheduled jobs and disables public-repository schedules after 60 days without activity. Its asset CDN can also cache an earlier observation. If the feed or schedule fails long enough, the 35-minute expiry makes coverage unknown, not fabricated/stale weather. Check Actions after a prolonged quiet period. To refresh manually: `gh workflow run satellite-clouds.yml --repo TofferAviation/Virtual-British-Airways-website`. A dedicated ingestion host can replace this arrangement later if guaranteed update timing is required.

## Checks and limitations

`npm run test:satellite-clouds` covers independent NOAA projection round trips, distinct product grids, categorical clear/unknown handling, bounded base estimates, missing retrievals, stale/malformed artifacts, compressed transport, translated-feature tracking, developing-cover evidence and the shader's pre-noise gates. Existing globe/cloud/integration tests remain in use.

This is a conservative reconstruction, not observed 3D cloud interiors, calibrated radiance, global satellite coverage, a forecast or a flight-safety weather product. Strict good-quality retrieval requirements can make reconstructed volume coverage much smaller than detected cloud coverage; this must remain visible instead of being “fixed” with fake fields.

### Cloud-only restoration, 24 October 2026

The strict inward-only clipping described in the historical restoration and v1/v2 notes below was subsequently superseded by the user-authorised 10 km reconstruction. Those passing tests and screenshots were not visual approval.

The 23 October cloud-shape repair was not visually accepted. Its numerical/performance checks did **not** establish restoration of the approved appearance. That experiment is superseded, not a new visual baseline. Before replacement, its tracked changes and renderer helper were saved in the workspace recovery patch `cloud-recovery-before-restoration-20261024.patch`, outside the website repository.

The accepted pre-satellite build is `5495a8d`. Its unmodified cloud noise/shape/erosion functions now live in `src/components/radar-globe/cloud-appearance.ts`. Its original phase, lighting, scattering and raymarch code is restored in `shaders.ts`; only the observation-aware diagnostic colouring differs. SHA-256 regression checks against canonical code from that commit guard both appearance and raymarching. The shipped noise assets, quality profiles, atmosphere, terrain, navigation and aurora are not changed by this restoration. These code checks establish provenance, **not** visual approval.

`satellite-cloud-adapter.ts` is separate from the accepted kernel. It rejects current clear, uncertain, unknown and incomplete-retrieval cells before appearance evaluation, interpolates continuous properties separately from raw support, supplies measured top/COD and an explicitly estimated base, and tapers only inward at unsupported neighbours. The same adapter controls volume and ground shadows. Its 0.58 occupancy input is the accepted model's internal shape calibration, not a measured cloud fraction; passing 1.0 at each observed cell previously saturated the model into slabs. High altitude alone no longer selects flat cirrus; optically thin high cloud may use the existing fibre model, while detailed cloud type remains an inference.

The experimental depth-dependent noise wavelengths, new erosion model, geometric march budget, per-column step controls and released-column A/B control have been removed. Tracking winds still associate consecutive observations and their continuous retrieved properties. They do not warp or rescale the restored appearance coordinate; this deliberately does not claim smooth advection of the entire observed footprint between scans. The latest mask stays authoritative. Unknown/provider/retrieval gaps remain unknown; no GFS coverage or manufactured global weather is reintroduced.

The two derived property/edge textures remain about 13 MB at 1800 × 900, rebuilt only on observation revisions. Asynchronous preparation of the actual volume/shadow/composite variants remains, with a visible preparing status. Unused live branches are compiled out of the explicitly labelled synthetic low-cloud calibration; no different appearance model is substituted there. Diagnostics identify `cloudRenderer: "5495a8d"`.

The `cumulus` preset is an explicitly labelled **synthetic** constant-profile calibration, not proof of current satellite locations. The `observed` preset uses real observations and live UTC sunlight. Close-up `observed-flight` and `observed-towers` use real observations with clearly displayed fixed comparison lighting. Verification must distinguish those cases. No deployment or public-feed change is part of this local restoration.

The subsequent corner-only adjustment (`rounded-inward-v1`) was also visually rejected: rounding individual tips and feathering alpha did not remove long grid-aligned walls. It is superseded by the formation-boundary change below. Its earlier screenshot and passing tests must not be treated as visual acceptance.

Local verification on 24 October: 88 globe/cloud/integration/satellite tests, targeted ESLint and the production build passed (the same nine unrelated filesystem-tracing warnings remain). Corner tests cover all four convex tips, radius bounds, inward-only subtraction across all 256 neighbour masks, and supported dateline continuity. The browser compiled the actual rounded adapter successfully and displayed the 07:59:53 UTC satellite field at 7.84 km with comparison sunlight; this is not the synthetic fixture. Low reached its 30 fps cap and Auto/High its 60 fps cap while stationary on this machine, using cached cloud frames; the latter's full refresh GPU cost was about 13.8 ms, not the roughly 1 ms cached-frame cost. These are snapshots, not low-end performance guarantees. A close-up screenshot was saved in the workspace as `cloud-rounded-corners-20261024.jpg`. Rounding softens cell tips, but does not restore missing satellite retrievals or resolve all coarse-grid boundaries. User visual approval is still separate from these checks; nothing was deployed.

### Continuous formation boundary, 24 October 2026

**Visually rejected and superseded.** The user still saw grid-shaped chunks in the top-down view; this section records that experiment, not the current renderer or an accepted baseline.

`continuous-formation-v2` reconstructs a continuous Euclidean distance field across neighbouring supported cells, capped at six display cells. Longitude wraps; beyond the poles is unsupported. A separable linear-time transform is performed only on observation revisions. The renderer-only texture now stores retrieved optical depth in R, this distance in G, retrieved top in B and local edge bits in A. The raw categorical mask and original retrievals are unchanged. G is interpolated continuously; A remains unfiltered. Current support is never interpolated from history; historical textures skip the unused distance/edge reconstruction.

The shader combines that distance with a conservative local rounded bound. It uses an inward envelope capped at 8 km / 60% of the narrower display cell, with height-dependent upper-shoulder retreat proportional to the estimated thickness. It then erodes the existing 3D cloud body near that boundary, rather than merely reducing opacity on a fully filled vertical wall. Interior occupancy remains 0.58; an initial trial that reduced occupancy was discarded because it re-thresholded entire cloud banks. The canonical accepted noise, phase, lighting and march remain unmodified. This is a visual reconstruction within the observation support, not more precise observed geometry, conserved optical depth or measured cloud thickness.

Both the volume and ground shadows use this same reconstruction after the original clear/uncertain/unknown/retrieval gates. There are no new per-frame texture fetches, noise samples, render targets or raymarch steps. The distance computation temporarily uses one Float32 display grid (about 6.5 MB at 1800 × 900); GPU texture sizes are unchanged. On this machine a current/history texture pair took about 330–345 ms during observation processing, not every frame; this is not a low-end timing guarantee. The corrected corner distance also avoids its old radius plateau in the interior of a bank. The `observed-corners` preset now matches the reported 12.67 km close-up. Passing tests and screenshots still require user visual review; this local work does not deploy or change the public observation feed.

Verification: all 92 focused tests, targeted ESLint and the final production build pass, with the same nine filesystem-tracing warnings. The distance field is checked against independent brute-force distances on small wrapped/polar grids. The final visible browser compiled the corrected edge-only erosion variant without new errors, reached its 60 fps cap using cached frames at 1869 × 834 ground / 1588 × 708 cloud resolution, and reported about 11.1 ms for a full cloud refresh versus about 1 ms for cached frames. The live observation changed from 08:09:53 to 08:19:53 UTC during checking; the final location correctly reported detected cloud with unknown volume because required retrievals were missing. Thus the before/final screenshots are not a frozen-observation A/B comparison. The final screenshot is `cloud-formation-boundary-v2-20261024.jpg` in the workspace. Aurora, terrain and camera-control code were not changed by this boundary revision.

### Curved cloud masses with a labelled 10 km uncertainty band, 24 October 2026

The user explicitly allowed a labelled boundary-uncertainty band of **at most 10 km**. `radar-cloud-footprint.ts` now constructs jittered, overlapping elliptical masses with correlated size variation across several display cells. Each seed requires a current usable cloud detection and both good retrievals. Distance to unsupported rectangles constrains its enclosing circle; nearby masses form curved banks rather than turning each satellite cell into a box. Thin high clouds use elongated masses. A height-dependent inward shoulder and the restored 5495a8d 3D erosion give upper edges relief instead of only fading an opaque vertical wall. Shape/type and correlated growth are aesthetic estimates, not observed updrafts, microphysics or simulated condensation.

The formation field uses a cubic B-spline with continuous values and derivatives across lookup cells. Four hardware-linear reads implement its 4 × 4 support. A nearest-mass analytic lookup was tested and discarded: a stress test exposed abrupt candidate-switch seams. Merely increasing texture resolution or rounding individual mask corners was insufficient. The final implementation does not contain that discontinuous selector.

Appearance confidence is interpolated separately in property G (probably-cloudy to cloudy). It is not a nearest-neighbour brightness switch at the old cell edge. The raw classification remains categorical and unchanged. This avoids exposing a sharp opacity grid inside an otherwise continuous fringe.

Filtering is **not** the authority for the 10 km limit. At an unsupported sample, the shared volume/shadow shader independently checks the distance to nearby **usable observed rectangles**, wrapping longitude. It then caps the support by the remaining band width. This prevents interpolation from leaking into distant clear/unknown regions. The original mask, API classifications, retrievals and provider gaps are not edited. The interface always labels the reconstructed edges; the below-camera status separately identifies a fringe as estimated, not directly observed. Missing whole fields, failed preparation, stale observations or absent current retrievals cannot generate global/GFS replacement weather.

Formation and current-property preparation run once per observation revision in a dedicated worker, not the rendering thread. Generation identifiers reject outdated results; teardown terminates the worker. The normal 0.2° field uses a 7200 × 3600 R8 lookup (about 25.9 MB GPU); Low / limited-memory devices use 3600 × 1800 (about 6.5 MB). Texture-size limits can reduce this further. Property textures retain their previous dimensions. A CPU copy is retained for the below-camera status. There are no new raymarch steps or cloud noise samples, but four footprint reads and a conditional boundary-distance search add shader work; cached-frame time must not be presented as full-render performance.

Tests cover deterministic masses, substantial silhouette variation along a rectangular source edge, continuous lookup values/slopes at all supported LODs, the independent 10 km cap, dateline rectangles and missing-retrieval exclusion. The canonical accepted appearance/lighting/march hashes still pass. `observed-overhead` reproduces the user's approximately 502 km top-down inspection; close-up comparisons remain separately available. These local changes do not deploy or change the public observation feed. Final visual approval remains the user's.

Appearance references: [WMO cumulus morphology](https://cloudatlas.wmo.int/en/clouds-genera-cumulus.html), [Met Office low clouds](https://weather.metoffice.gov.uk/learn-about/weather/types-of-weather/clouds/low-level-clouds), and [Guerrilla's volumetric-cloud presentation](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn). These informed coherent masses, domed upper profiles and finer edge erosion; no third-party shader or artwork was copied.

Final local verification: **98** focused tests and the production build pass; targeted renderer/worker/source-page ESLint passes. The same nine unrelated build tracing warnings remain. Including the otherwise unchanged `PublicBaRadar.tsx` in lint still reports its three pre-existing hook/ref errors and image warning; this change only updates that component's cloud-policy text. In the full-size browser, `smooth-cloud-masses-v5.1-10km` compiled without console errors and displayed the 09:09:53 UTC observations at approximately 502 km AGL, with fixed comparison sunlight (not live UTC lighting). Auto/High reached its stationary 60 fps cap at 1869 × 834 ground / 1588 × 708 clouds; a full cloud refresh cost about 7.2 ms, versus about 0.4 ms cached frames. An earlier 1024 × 376 close-up check reached Low's 30 fps cap; High camera motion cost about 7.3–7.6 ms with its reduced moving cloud viewport, versus about 14.7 ms for a full stationary refresh. These are different views/resolutions on this machine, not a controlled performance comparison or low-end guarantee. The final top-down screenshot is `cloud-formation-v5-10km-20261024.jpg` in the workspace. No deployment, commit, public feed or aurora/navigation change was made in this revision.

### Local verification, 23 October 2026

- All 78 satellite/cloud/globe/integration tests passed, along with TypeScript and targeted ESLint checks. The production build passed with 10 filesystem tracing warnings; the observation artifact is intentionally a separately provisioned runtime file, not a bundled build asset.
- The production `/ba-radar` preview served version 2 observations and displayed the satellite-only controls, source time, clear/unknown rules and retrieval availability. No browser/shader errors were reported during that check.
- Two consecutive GOES-18/19 scans ending around 19:59 UTC classified 31% of the display grid; 69% remained geographically unknown. 16,256 of 350,417 detected cloud cells (4.6%) had both accepted retrievals. Missing/degraded optical depth was the main limitation. These are snapshot counts, not guaranteed coverage.
- The observed-Americas QA preset used live UTC sunlight and the real observation field, not synthetic calibration. The stationary 1024 × 376 render reached its 60 fps cap on this test machine with an 870 × 319 cloud buffer; this is not a low-end hardware performance guarantee. An Africa/Europe check reported unknown beneath the camera without generated cloud fill.
- These initial checks preceded hosted-feed release wiring. Neither the accepted aurora appearance nor its controls were changed. Additional regional providers remain outstanding.

### Hosted-feed release checks

The satellite suite now also tests the hosted gzip feed, size limits, stale/malformed/forecast rejection and unavailable responses. The existing Website CI lint step still reports pre-existing source hook/ref violations outside the new feed; these have not been hidden by disabling rules. Generated `.next-globe-qa` output is excluded from lint just like `.next`.

Operations references: [standard GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [release asset limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), [scheduled-workflow limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Primary references: [NOAA ABI navigation](https://www.star.nesdis.noaa.gov/atmospheric-composition-training/satellite_data_goes_imager_projection.php), [NOAA GOES public archive](https://github.com/NOAA-Big-Data-Program/nodd-data-docs/blob/main/GOES/README.md), [cloud mask](https://www.goes-r.gov/products/baseline-clear-sky-mask.html), [optical depth](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01508), [cloud-top height](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc%3AC01505).
