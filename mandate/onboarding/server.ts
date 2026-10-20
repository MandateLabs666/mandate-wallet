import type {IncomingMessage,ServerResponse} from "node:http";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {serveWorkspace} from "../web/server.js";
import {SetupEngine} from "./engine.js";
import {SetupProfiles,profileIdSchema} from "./profiles.js";
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(x=>x as `0x${string}`),id=z.string().regex(/^[a-f0-9]{32}$/);
const command=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("new-local"),requestId:id,approved:z.literal(true)}).strict(),
 z.object({operation:z.literal("new-public"),requestId:id,approved:z.literal(true),chainId:z.union([z.literal(84532),z.literal(11155111)]),owner:z.string().regex(/^0x[0-9a-fA-F]{40}$/)}).strict(),
 z.object({operation:z.literal("local")}).strict(),z.object({operation:z.literal("local-revoke"),approved:z.literal(true)}).strict(),
 z.object({operation:z.literal("public"),chainId:z.union([z.literal(84532),z.literal(11155111)]),owner:z.string()}).strict(),
 z.object({operation:z.literal("prepare"),kind:z.enum(["account","fund-usdc","fund-gas","mandate","session"])}).strict(),
 z.object({operation:z.literal("mark"),id,state:z.enum(["awaiting-wallet","rejected","submission-unknown"])}).strict(),
 z.object({operation:z.literal("broadcast"),id,hash}).strict(),z.object({operation:z.literal("reconcile"),id}).strict(),
 z.object({operation:z.literal("finish")}).strict(),z.object({operation:z.literal("check")}).strict(),
 z.object({operation:z.literal("host-preview"),host:z.enum(["claude-code","codex"]),scope:z.enum(["project","user"])}).strict(),
 z.object({operation:z.literal("host-apply"),id,approved:z.literal(true)}).strict(),z.object({operation:z.literal("host-undo"),id,approved:z.literal(true)}).strict(),
]);
export async function serveSetup(source:SetupEngine|SetupProfiles,options:{port?:number;staticDirectory:string}){
 const profiles=source instanceof SetupProfiles?source:undefined;
 const selected=(req:IncomingMessage)=>{
  const header=req.headers['x-mandate-profile'],query=new URL(req.url??'/',"http://127.0.0.1").searchParams.getAll('profile');
  if(Array.isArray(header)||query.length>1||header&&query.length&&header!==query[0])throw Error("SETUP_PROFILE_INVALID");
  const value=header??query[0];if(value!==undefined)profileIdSchema.parse(value);return value;
 };
 const engineFor=(req:IncomingMessage)=>profiles?profiles.resolve(selected(req)):source as SetupEngine;
 const token=randomBytes(32).toString("hex"),cookieName="mandate_setup_"+randomBytes(6).toString('hex');
 const authenticated=(req:IncomingMessage)=>{const value=req.headers.cookie?.split(";").map(s=>s.trim()).find(s=>s.startsWith(cookieName+"="))?.slice(cookieName.length+1);return typeof value==="string"&&value.length===token.length&&timingSafeEqual(Buffer.from(value),Buffer.from(token));};
 const setup=async(req:IncomingMessage,res:ServerResponse,origin:string)=>{
  const reply=(status:number,value:unknown)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value,(_,v)=>typeof v==="bigint"?String(v):v));return true;};
  const url=new URL(req.url??'/',origin),pathname=url.pathname;
  if(req.method==="GET"&&["/","/setup.html"].includes(pathname)){res.setHeader("Set-Cookie",`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`);if(req.url==="/"){res.writeHead(302,{Location:"/setup.html"});res.end();return true;}return false;}
  if(!req.url?.startsWith("/api/setup"))return false;
  if(!authenticated(req))return reply(401,{code:"SETUP_BROWSER_CONNECTION_REQUIRED"});
  let engine:SetupEngine;try{engine=engineFor(req);}catch{return reply(409,{code:"SETUP_PROFILE_NOT_FOUND"});}
  if(req.method==="GET"&&req.url==="/api/setup/status")return reply(200,profiles?await profiles.status(selected(req)):await engine.status());
  if(req.method==="GET"&&pathname==="/api/setup/desktop.mcpb"&&[...url.searchParams.keys()].every(k=>k==='profile')){
   try{const bytes=engine.integration().desktopPackage();res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Disposition":"attachment; filename=mandate-wallet-guided.mcpb","Cache-Control":"no-store"});res.end(bytes);return true;}catch{return reply(409,{code:"SETUP_CONNECTION_NOT_READY"});}
  }
  if(req.url!=="/api/setup"||req.method!=="POST")return reply(404,{code:"SETUP_ROUTE_NOT_FOUND"});
  if(req.headers.origin!==origin||req.headers["x-mandate-setup"]!=="1"||!req.headers["content-type"]?.startsWith("application/json"))return reply(403,{code:"SETUP_BROWSER_ORIGIN_REJECTED"});
  try{
   let size=0;const chunks:Buffer[]=[];for await(const b of req){size+=b.length;if(size>16384)return reply(413,{code:"SETUP_INPUT_TOO_LARGE"});chunks.push(b);}
   const c=command.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));let result:unknown;
   switch(c.operation){
    case "new-local":if(!profiles)throw Error("SETUP_PROFILE_UPGRADE_REQUIRED");result=await profiles.create({kind:'local',requestId:c.requestId});break;
    case "new-public":if(!profiles)throw Error("SETUP_PROFILE_UPGRADE_REQUIRED");result=await profiles.create({kind:'public',requestId:c.requestId,chainId:c.chainId,owner:c.owner});break;
    case "local":result=await engine.createLocal();break;
    case "local-revoke":result=await engine.revokeLocal();break;
    case "public":result=await engine.beginPublic(c.chainId,c.owner);break;
    case "prepare":result=await engine.prepare(c.kind);break;
    case "mark":result=engine.mark(c.id,c.state);break;
    case "broadcast":result=await engine.broadcast(c.id,c.hash);break;
    case "reconcile":result=await engine.reconcile(c.id);break;
    case "finish":result=await engine.finishPublic();break;
    case "check":result=await engine.checkConnection();break;
    case "host-preview":result=engine.integration().prepare(c.host,c.scope);break;
    case "host-apply":result=engine.integration().apply(c.id);break;
    case "host-undo":result=engine.integration().undo(c.id);break;
   }
   return reply(200,result);
  }catch(e){const message=e instanceof Error?e.message:"";return reply(409,{code:e instanceof z.ZodError?"SETUP_INPUT_INVALID":/^[A-Z][A-Z0-9_]+$/.test(message)?message:"SETUP_OPERATION_UNAVAILABLE"});}
 };
 return serveWorkspace(req=>engineFor(req).workspace,{authenticate:(t,req)=>engineFor(req!).authenticate(t),port:options.port,staticDirectory:options.staticDirectory,setup,browserAuthenticated:authenticated});
}
