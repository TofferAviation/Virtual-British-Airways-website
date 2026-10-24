/** Publish only one regenerable public MODEL feed in its own marked release.
 * Does not replace the satellite release, raw files, application or user data. */
import {readFile,mkdtemp,writeFile,unlink,rmdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {validateForecastCloudData} from "../src/lib/radar-cloud-forecast.ts";
import {FORECAST_FEED_MAX_BYTES} from "../src/lib/radar-cloud-forecast-feed.ts";

const repository="TofferAviation/Virtual-British-Airways-website",tag="bav-global-forecast-v1",marker="BAV_MANAGED_GLOBAL_FORECAST_V1";
// Validate/size-check locally before any external release creation or upload.
const file=resolve(process.env.BAV_FORECAST_CLOUD_FILE??".bav-data/forecast-clouds/latest.json");
const data=validateForecastCloudData(JSON.parse(await readFile(file,"utf8")));
const packed=gzipSync(Buffer.from(JSON.stringify(data)),{level:6});
if(packed.length>FORECAST_FEED_MAX_BYTES)throw Error("Forecast exceeds hosting limit");
const gh=args=>execFileSync("gh",[...args,"--repo",repository],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
let release;
try{release=JSON.parse(gh(["release","view",tag,"--json","body,isDraft,isPrerelease,url"]));}
catch(error){
  if(!/release not found|HTTP 404/i.test(String(error.stderr)))throw error;
  gh(["release","create",tag,"--target","main","--prerelease","--latest=false","--title","Generated global GFS cloud forecast","--notes",`${marker}\nReplaceable NOAA GFS forecast only. Not satellite observations or an application release.`]);
  release=JSON.parse(gh(["release","view",tag,"--json","body,isDraft,isPrerelease,url"]));
}
if(release.isDraft||!release.isPrerelease||!release.body.startsWith(marker))throw Error("Refusing to overwrite unmanaged release");
const directory=await mkdtemp(join(tmpdir(),"bav-forecast-feed-")),output=join(directory,"latest.json.gz");
try{await writeFile(output,packed);gh(["release","upload",tag,output,"--clobber"]);console.log(JSON.stringify({release:release.url,validAt:data.validAt,bytes:packed.length}));}
finally{await unlink(output).catch(()=>{});await rmdir(directory);}
