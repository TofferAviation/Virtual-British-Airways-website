import type { RadarCloudData } from "./radar-external";

async function inflate(value:string,limit:number) {
  if(typeof DecompressionStream==="undefined")throw Error("This browser cannot decode satellite observations");
  const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error("Oversized cloud texture");chunks.push(value);}}finally{await reader.cancel();}
  const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  let text="";for(let i=0;i<data.length;i+=32768)text+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(text);
}
export async function unpackCloudData(data:RadarCloudData):Promise<RadarCloudData> {
  if(data.encoding==="rgba8-base64")return data;
  if(data.encoding!=="rgba8-gzip-base64"||!Number.isInteger(data.width)||!Number.isInteger(data.height)||data.width<1||data.height<1||data.width*data.height>6_480_000)throw Error("Invalid cloud transport");
  const limit=data.width*data.height*4;
  const layers=await Promise.all(data.layers.map(async l=>({...l,volume:await inflate(l.volume,limit)})));
  const s=data.satellite;
  const satellite=s?{...s,current:{...s.current,volume:await inflate(s.current.volume,limit)},previous:s.previous?{...s.previous,volume:await inflate(s.previous.volume,limit)}:null,motion:await inflate(s.motion,limit)}:undefined;
  return {...data,encoding:"rgba8-base64",layers,satellite};
}
