# Satellite-observed Live clouds

Live cloud locations are satellite-observed only. Production reads a validated, compressed public observation asset prepared separately by the repository's GitHub Actions workflow; Render does not decode native satellite files.

## Rules

- ACMF's good-quality four-level mask determines cloud support. Clear is exactly zero extinction, probably-clear is uncertain/unrendered, and missing/bad-quality/space/outside-footprint pixels are unknown.
- CODF supplies optical depth only when its retrieval is good-quality; ACHAF supplies cloud-top geopotential height only when good-quality. Missing/degraded retrievals are not replaced with made-up optical depth or tops. A mask can report cloud while its volume remains unknown/unrendered.
- Only cloud base and full thickness are estimated, with a bounded, documented heuristic from the available optical depth and top height. These are not measurements of overlapping/hidden cloud layers.
- Procedural noise supplies internal volume detail only after the categorical observation and property-availability gates. The same gates govern ground shadows.
- GFS is a motion prior, never a cloud-location or unknown-area fallback.

## Coverage and navigation

The first provider ingests public NOAA GOES-19/East and GOES-18/West full-disk ACMF, CODF and ACHAF NetCDF4 products. It uses each file's packed coordinate scales/offsets, actual perspective height, ellipsoid axes, projection-origin longitude, sweep axis, fill values and quality flags. Products are matched to the same scan and sampled on their own grids. Processing revisions of one scan do not count as consecutive observations.

Output is a north-first, cell-centred geographic grid with no duplicated dateline or pole row. The default 0.2° display grid is a performance choice, **not the native satellite resolution**. Optional 0.1° output increases memory/transfer costs. Categorical nearest-neighbour masks are never blurred into clear/unknown cells. Multi-satellite overlap selects the usable view with the lower local zenith angle. Views beyond 70° local zenith are excluded, not stretched to fill the rest of Earth.

GOES is **not a global provider**. Much of Europe, Africa, Asia and the polar regions remains unknown. Nominal ABI ellipsoid navigation is used; a full cloud-parallax correction is not implemented. More regional/global observations require separately verified providers; neither NASA daytime photographs nor GFS coverage silently fills these gaps.

## Motion

The ingester compares two synchronized consecutive mosaics. A bounded patch matcher uses real cloud-mask/optical-depth structure and existing GFS surface/FL180/FL300 winds as height-selected priors where available. Low-confidence matches retain the labelled wind prior; missing wind/transport evidence does not grant a development classification. Newly detected cover over a confidently clear previous neighbourhood, not explained by the estimated transport, is flagged developing. This is an inference, not a direct measurement of condensation or a high-resolution optical-flow solver.

The shader transports procedural detail and blends corresponding retrieved column properties over 12 seconds, constrained by the **latest observed mask**. A new clear/unknown report takes effect immediately. It does not extrapolate a cloud footprint into a newer clear/unknown cell, or claim that subpixel cloud structures and their movement were observed. Source scan times are retained per satellite; the composite timestamp is the latest scan end.

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
