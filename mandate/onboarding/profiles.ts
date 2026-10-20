import {existsSync,openSync,closeSync,unlinkSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {randomBytes} from "node:crypto";
import {z} from "zod";
import {SetupEngine} from "./engine.js";
import {atomicPrivate,privateDirectory,readJSON,stringify,digest} from "./files.js";

export const profileIdSchema=z.string().regex(/^[a-f0-9]{32}$/);
const recordSchema=z.object({id:profileIdSchema,kind:z.enum(["local","public","import"]),fingerprint:z.string(),createdAt:z.string(),phase:z.enum(["pending","ready","failed"]),error:z.string().optional()}).strict();
const registrySchema=z.object({schemaVersion:z.literal(1),defaultProfileId:profileIdSchema.optional(),profiles:z.array(recordSchema).max(100)}).strict();
type Registry=z.infer<typeof registrySchema>;
export type NewProfile={requestId:string;kind:"local"}|{requestId:string;kind:"public";chainId:number;owner:string};

/** Each browser request selects a profile explicitly. MCP descriptors never follow a global active profile. */
export class SetupProfiles {
 readonly profileSupport=true;
 private registry:Registry={schemaVersion:1,profiles:[]};
 private engines=new Map<string,SetupEngine>();
 private inFlight=new Set<string>();
 private empty:SetupEngine;
 private lock:string;
 constructor(readonly options:ConstructorParameters<typeof SetupEngine>[0]){
  options.directory=resolve(options.directory);privateDirectory(options.directory);
  this.lock=join(options.directory,"profiles.lock");
  if(existsSync(this.lock)){
   const pid=Number(readFileSync(this.lock,"utf8"));
   if(!Number.isSafeInteger(pid)||pid<=0)throw Error("SETUP_PROFILE_LOCK_INVALID");
   let alive=true;try{process.kill(pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==="ESRCH")alive=false;}
   if(alive)throw Error("SETUP_PROFILE_SERVICE_ALREADY_RUNNING");unlinkSync(this.lock);
  }
  const fd=openSync(this.lock,"wx",0o600);try{atomicPrivate(this.lock,String(process.pid));}finally{closeSync(fd);}
  try{
   if(existsSync(this.path()))this.registry=registrySchema.parse(readJSON(this.path()));
   if(new Set(this.registry.profiles.map(p=>p.id)).size!==this.registry.profiles.length)throw Error("SETUP_PROFILE_REGISTRY_INVALID");
   if(this.registry.defaultProfileId&&!this.registry.profiles.some(p=>p.id===this.registry.defaultProfileId))throw Error("SETUP_PROFILE_REGISTRY_INVALID");
   this.empty=new SetupEngine({...options,directory:join(options.directory,"empty")});
   for(const p of this.registry.profiles)this.engines.set(p.id,this.make(p.id));
  }catch(e){unlinkSync(this.lock);throw e;}
 }
 private path(){return join(this.options.directory,"profiles.json");}
 private save(){atomicPrivate(this.path(),stringify(this.registry));}
 private make(id:string){return new SetupEngine({...this.options,directory:join(this.options.directory,"profiles",id)});}
 resolve(id?:string){
  const selected=id??this.registry.defaultProfileId;
  if(!selected)return this.empty;
  profileIdSchema.parse(selected);const engine=this.engines.get(selected);
  if(!engine)throw Error("SETUP_PROFILE_NOT_FOUND");return engine;
 }
 async restore(){
  for(const p of this.registry.profiles){try{await this.resolve(p.id).restore();}catch{p.error="SETUP_RUNTIME_UNAVAILABLE";}}
  this.save();
  // Read the previous single-profile format without modifying its setup file or connection descriptor.
  const legacy=join(this.options.directory,"setup.json");
  if(existsSync(legacy)){const s=readJSON(legacy);if(s.profilePath&&s.credentialPath)await this.importExisting(s.profilePath,s.credentialPath);}
 }
 async importExisting(profile:string,credential:string){
  const fingerprint=digest(stringify({profile:resolve(profile),credential:resolve(credential)}));
  const existing=this.registry.profiles.find(p=>p.kind==="import"&&p.fingerprint===fingerprint);
  if(existing)return existing.id;
  const id=randomBytes(16).toString("hex"),p={id,kind:"import" as const,fingerprint,createdAt:new Date().toISOString(),phase:"pending" as const};
  this.registry.profiles.push(p);const engine=this.make(id);this.engines.set(id,engine);this.save();
  try{await engine.importExisting(profile,credential);Object.assign(p,{phase:"ready"});this.registry.defaultProfileId??=id;this.save();return id;}
  catch(e){Object.assign(p,{phase:"failed",error:"SETUP_RUNTIME_UNAVAILABLE"});this.save();throw e;}
 }
 async create(input:NewProfile){
  const id=profileIdSchema.parse(input.requestId),fingerprint=digest(stringify(input.kind==="local"?{kind:input.kind}:{kind:input.kind,chainId:input.chainId,owner:input.owner.toLowerCase()}));
  const prior=this.registry.profiles.find(p=>p.id===id);
  if(prior){
   if(prior.fingerprint!==fingerprint)throw Error("SETUP_PROFILE_REQUEST_CHANGED");
   if(this.inFlight.has(id))throw Error("SETUP_OPERATION_IN_PROGRESS");
   // A request that may have started is never replayed as a second deployment.
   if(prior.phase!=="ready")throw Error("SETUP_PROFILE_CREATION_REVIEW_REQUIRED");
   return {profileId:id};
  }
  if(this.registry.profiles.length>=100)throw Error("SETUP_PROFILE_LIMIT_REACHED");
  const p:z.infer<typeof recordSchema>={id,kind:input.kind,fingerprint,createdAt:new Date().toISOString(),phase:"pending"};
  const engine=this.make(id);this.registry.profiles.push(p);this.engines.set(id,engine);this.inFlight.add(id);this.save();
  try{
   if(input.kind==="local")await engine.createLocal();else await engine.beginPublic(input.chainId,input.owner);
   p.phase="ready";this.registry.defaultProfileId??=id;this.save();return {profileId:id};
  }catch(e){p.phase="failed";const message=e instanceof Error?e.message:"";p.error=/^[A-Z][A-Z0-9_]+$/.test(message)?message:"SETUP_OPERATION_UNAVAILABLE";this.save();throw e;}
  finally{this.inFlight.delete(id);}
 }
 async status(id?:string){
  const engine=this.resolve(id),status=await engine.status();
  return {...status,profileSupport:true,selectedProfileId:id??this.registry.defaultProfileId??null,profiles:this.registry.profiles.map(p=>{
   const s=this.resolve(p.id).state;return {id:p.id,kind:p.kind,phase:p.phase,createdAt:p.createdAt,chainId:s?.chainId,wallet:s?.wallet,error:p.error};
  })};
 }
 async close(){
  try{for(const engine of this.engines.values())await engine.close();await this.empty.close();}
  finally{if(existsSync(this.lock)&&readFileSync(this.lock,"utf8")===String(process.pid))unlinkSync(this.lock);}
 }
}
