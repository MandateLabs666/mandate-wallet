import {readFileSync,statSync} from "node:fs";
import {isAbsolute,join} from "node:path";
import {homedir} from "node:os";
import {createHash} from "node:crypto";
import {z} from "zod";
import {MandateError} from "../sdk/model.js";

export const ConnectionDescriptorSchema=z.object({
  schemaVersion:z.literal(1),profilePath:z.string().refine(isAbsolute),credentialFilePath:z.string().refine(isAbsolute),
  profileSHA256:z.string().regex(/^[a-f0-9]{64}$/),chainId:z.union([z.literal(31337),z.literal(84532),z.literal(11155111)]),
  wallet:z.string().regex(/^0x[0-9a-fA-F]{40}$/),mandateId:z.string().regex(/^0x[0-9a-fA-F]{64}$/),sessionId:z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict();
export function readPrivateFile(path:string){
  const s=statSync(path);
  if(!s.isFile()||(s.mode&0o077)!==0||s.size>1024*1024)throw new MandateError("DESKTOP_PRIVATE_FILE_REJECTED");
  return readFileSync(path,"utf8");
}
export function desktopConnection(args:string[]){
  if(args.length===4&&args[0]==="--config"&&args[2]==="--credential-file"&&args[1]&&args[3]){
    if(!isAbsolute(args[1])||!isAbsolute(args[3]))throw new MandateError("DESKTOP_ABSOLUTE_PATHS_REQUIRED");
    return {config:args[1],credential:args[3],check:()=>{},scope:undefined};
  }
  const automatic=args.length===0||(args.length===4&&args[0]==="--config"&&args[2]==="--credential-file"&&!args[1]&&!args[3]);
  if(!automatic&&!(args.length===2&&args[0]==="--connection"&&isAbsolute(args[1])))throw new MandateError("DESKTOP_ABSOLUTE_PATHS_REQUIRED");
  const path=automatic?join(homedir(),"Library/Application Support/Mandate/connection.json"):args[1];
  const text=readPrivateFile(path),scope=ConnectionDescriptorSchema.parse(JSON.parse(text));
  const check=()=>{
    if(readPrivateFile(path)!==text||createHash("sha256").update(readPrivateFile(scope.profilePath)).digest("hex")!==scope.profileSHA256)throw new MandateError("DESKTOP_CONNECTION_CHANGED_RESTART_REQUIRED");
  };
  check();return {config:scope.profilePath,credential:scope.credentialFilePath,check,scope};
}
