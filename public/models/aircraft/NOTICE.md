# Aircraft asset notice

These aircraft assets are derived from Flightradar24/fr24-3d-models,
revision dd53267690c6a4ecbb290a3acf0284333a5d68a9.
Upstream credits the FlightGear project and FGMEMBERS model authors.
Original credits and model-specific upstream links are in UPSTREAM-README.md.

The aircraft assets, including the converted versions, are licensed under the
GNU General Public License version 2. See LICENSE.txt. They are supplied WITHOUT
ANY WARRANTY, including merchantability or fitness for a particular purpose.

Changes by British Airways Virtual, 24 October 2026: converted legacy glTF 1.0
GLB files to glTF 2.0 with gltf-pipeline 4.3.1. The viewer centres/batches the
static geometry at runtime; house liveries are retained, not British Airways
liveries. Aircraft are not endorsed by Flightradar24 or the model authors.

Corresponding editable Blender files, original source packages and original
GLBs are supplied alongside each model in source/<model-key>/; manifest.json
lists every source filename. SOURCES.html links directly to the licence,
notices and all source files, with no account required. The viewer's
/globe-sources credits page also lists them.

To reproduce the conversion: install Node.js, run npm install gltf-pipeline@4.3.1,
and run the import-radar-aircraft.mjs script in the source directory below.

No FSLTL, MSFS or Asobo model assets are included.
