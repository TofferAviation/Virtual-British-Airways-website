import fs from "node:fs/promises";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/import-heathrow-callsign-reference.mjs <input.xlsx> <output.ts>");
}

const sheets = await readXlsxFile(inputPath);
const selected = sheets.find((sheet) => sheet.sheet === "Heathrow Callsigns");
if (!selected) throw new Error("Could not find the Heathrow Callsigns worksheet.");
const rows = selected.data;
const [header, ...records] = rows;
const column = Object.fromEntries(header.map((value, index) => [String(value), index]));
const required = ["Flight Number", "From", "To", "Reference ATC Callsign"];
for (const name of required) {
  if (column[name] === undefined) throw new Error(`Missing required column: ${name}`);
}

const services = records.map((record) => ({
  flightNumber: String(record[column["Flight Number"]] ?? "").trim().toUpperCase(),
  from: String(record[column.From] ?? "").trim().toUpperCase(),
  to: String(record[column.To] ?? "").trim().toUpperCase(),
  callsign: String(record[column["Reference ATC Callsign"]] ?? "").trim().toUpperCase(),
})).filter((service) => /^BA\d+$/.test(service.flightNumber) && /^[A-Z]{3}$/.test(service.from) && /^[A-Z]{3}$/.test(service.to) && /^(?:BAW|SHT)\d{1,4}[A-Z]{0,2}$/.test(service.callsign));

if (services.length !== 740) throw new Error(`Expected 740 Heathrow services, found ${services.length}.`);

const source = `/**\n * Heathrow operational reference imported from the supplied\n * British_Airways_Heathrow_2026_Timetable_Correct_Callsigns.xlsx workbook.\n *\n * This data supplies known flight-number, airport-pair and operational ICAO\n * callsign mappings. It is not a day-by-day timetable: service times and\n * aircraft remain BAV flight-simulation planning references unless separately\n * date-checked.\n */\nexport const BAV_HEATHROW_CALLSIGN_REFERENCE_VERSION = "2026-01-01-to-2026-10-04";\n\nexport type HeathrowCallsignReference = {\n  flightNumber: string;\n  from: string;\n  to: string;\n  callsign: string;\n};\n\nexport const heathrowCallsignReferences: readonly HeathrowCallsignReference[] = [\n${services.map((service) => `  { flightNumber: "${service.flightNumber}", from: "${service.from}", to: "${service.to}", callsign: "${service.callsign}" },`).join("\n")}\n];\n`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, source, "utf8");
console.log(`Wrote ${services.length} Heathrow reference services to ${outputPath}`);
