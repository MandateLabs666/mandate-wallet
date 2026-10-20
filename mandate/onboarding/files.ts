import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,lstatSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {randomBytes,createHash} from "node:crypto";
export const digest=(s:string|Uint8Array)=>createHash("sha256").update(s).digest("hex");
export const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n";
export function privateDirectory(path:string){mkdirSync(path,{recursive:true,mode:0o700});if(lstatSync(path).isSymbolicLink())throw Error("SETUP_SYMLINK_REJECTED");chmodSync(path,0o700);}
export function atomicPrivate(path:string,contents:string|Uint8Array){
  if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error("SETUP_SYMLINK_REJECTED");
  mkdirSync(dirname(path),{recursive:true,mode:0o700});const temporary=path+".tmp-"+randomBytes(8).toString("hex");
  writeFileSync(temporary,contents,{mode:0o600,flag:"wx"});renameSync(temporary,path);chmodSync(path,0o600);
}
export const readJSON=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
