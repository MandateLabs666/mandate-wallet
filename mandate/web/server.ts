import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {z} from "zod";
import {MandateWorkspace} from "../sdk/workspace.js";
import {MandateError} from "../sdk/model.js";
import type {Hex} from "viem";
import {independentlyVerify} from "../sdk/independent-verification.js";
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v as Hex);
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v);
const routes=z.discriminatedUnion("operation",[
  z.object({operation:z.literal("snapshot"),taskId:hash}).strict(),
  z.object({operation:z.literal("create"),input:z.unknown()}).strict(),
  z.object({operation:z.literal("owner-action"),input:z.unknown()}).strict(),
  z.object({operation:z.literal("owner-request"),requestId:hash}).strict(),
  z.object({operation:z.literal("owner-broadcast"),requestId:hash,transactionHash:hash}).strict(),
  z.object({operation:z.literal("quote"),taskId:hash,serviceId:hash}).strict(),
  z.object({operation:z.literal("call"),taskId:hash,serviceId:hash}).strict(),
  z.object({operation:z.literal("receipt"),taskId:hash,serviceId:hash}).strict(),
  z.object({operation:z.literal("search"),taskId:hash,query:z.string().trim().min(1).max(300)}).strict(),
  z.object({operation:z.literal("evidence"),taskId:hash,serviceId:hash,disclosure:z.object({request:z.boolean(),result:z.boolean()}).strict()}).strict(),
  z.object({operation:z.literal("check-evidence"),taskId:hash,serviceId:hash,disclosure:z.object({request:z.boolean(),result:z.boolean()}).strict()}).strict(),
]);
async function body(req:IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw new MandateError("WEB_REQUEST_TOO_LARGE");chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
export async function serveWorkspace(initialWorkspace:MandateWorkspace|((req:IncomingMessage)=>MandateWorkspace|undefined),options:{authenticate:(token:string|undefined,req?:IncomingMessage)=>void;port?:number;staticDirectory:string;allowedOrigins?:string[];setup?:(req:IncomingMessage,res:ServerResponse,origin:string)=>Promise<boolean>;browserAuthenticated?:(req:IncomingMessage)=>boolean}){
  let origin="";const staticFiles:Record<string,{file:string;type:string}>={"/":{file:"index.html",type:"text/html"},"/index.html":{file:"index.html",type:"text/html"},"/app.html":{file:"app.html",type:"text/html"},"/docs.html":{file:"docs.html",type:"text/html"},"/walkthrough.html":{file:"walkthrough.html",type:"text/html"},"/setup.html":{file:"setup.html",type:"text/html"},"/setup.js":{file:"setup.js",type:"text/javascript"},"/styles.css":{file:"styles.css",type:"text/css"},"/app.js":{file:"app.js",type:"text/javascript"},"/favicon.svg":{file:"favicon.svg",type:"image/svg+xml"},"/mandate-contracts-v2.zip":{file:"mandate-contracts-v2.zip",type:"application/zip"},"/contracts-release.json":{file:"contracts-release.json",type:"application/json"}};
  const server=createServer(async(req,res)=>{
    const response=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(json(data));};
    try{
      if(req.headers.host!==new URL(origin).host)return response(400,{code:"WEB_HOST_MISMATCH"});
      // Separate the explicitly supported page parameter from static routing.
      // Unknown file/path query parameters retain their existing rejection.
      const requested=req.url??"/",pathname=requested.split("?",1)[0],parameters=new URL(requested,origin).searchParams;
      const profileQueryAllowed=parameters.getAll('profile').length<=1&&(!parameters.has('profile')||/^[a-f0-9]{32}$/.test(parameters.get('profile')!));
      const staticQueryAllowed=parameters.size===0||(profileQueryAllowed&&(
        pathname==='/setup.html'&&[...parameters.keys()].every(k=>k==='profile')||
        pathname==='/app.html'&&parameters.getAll('onboarding').length<=1&&(!parameters.has('onboarding')||parameters.get('onboarding')==='1')&&[...parameters.keys()].every(k=>k==='profile'||k==='onboarding')
      ));
      const requester=req.headers.origin;
      if(requester){if(![origin,...options.allowedOrigins??[]].includes(requester))return response(403,{code:"WEB_ORIGIN_REJECTED"});res.setHeader("Access-Control-Allow-Origin",requester);res.setHeader("Vary","Origin");}
      if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Methods":"POST, GET","Access-Control-Allow-Headers":"content-type, authorization"});return res.end();}
      if(options.setup&&await options.setup(req,res,origin))return;
      if(req.url==="/api/health"&&req.method==="GET")return response(200,{schemaVersion:2,service:"Mandate local workspace",dataMode:"requires-authenticated-connection"});
      if(req.url==="/api/workspace"&&req.method==="POST"){
        const workspace=typeof initialWorkspace==="function"?initialWorkspace(req):initialWorkspace;if(!workspace)return response(409,{code:"WEB_SETUP_REQUIRED"});
        const auth=req.headers.authorization;if(!options.browserAuthenticated?.(req))options.authenticate(auth?.startsWith("Bearer ")?auth.slice(7):undefined,req);
        const raw=await body(req);
        if(raw?.operation==="connect"){if(Object.keys(raw).length!==1)throw new MandateError("WEB_INPUT_SCHEMA_INVALID");return response(200,await workspace.snapshot(workspace.base.purchase.context.mandateId));}
        const input=routes.parse(raw);let result:unknown;
        switch(input.operation){
          case "snapshot":result=await workspace.snapshot(input.taskId);break;
          case "create":result=await workspace.draftCreate(input.input);break;
          case "owner-action":result=await workspace.draftAction(input.input);break;
          case "owner-request":result=await workspace.ownerRequest(input.requestId);break;
          case "owner-broadcast":result=await workspace.noteOwnerBroadcast(input.requestId,input.transactionHash);break;
          case "quote":result=await workspace.quote(input.taskId,input.serviceId);break;
          case "call":result=await workspace.call(input.taskId,input.serviceId);break;
          case "receipt":result=await workspace.receipt(input.taskId,input.serviceId);break;
          case "search":result=await workspace.search(input.taskId,input.query);break;
          case "evidence":result=await workspace.evidence(input.taskId,input.serviceId,input.disclosure);break;
          case "check-evidence":result=await independentlyVerify(await workspace.evidence(input.taskId,input.serviceId,input.disclosure),await workspace.evidenceTrust(input.taskId,input.serviceId));break;
        }
        return response(200,result);
      }
      const resource=staticQueryAllowed&&Object.hasOwn(staticFiles,pathname)?staticFiles[pathname]:undefined;
      if(req.method!=="GET"||!resource)return response(404,{code:"WEB_ROUTE_NOT_FOUND"});
      res.writeHead(200,{"content-type":resource.type+(resource.type==="application/zip"?"":"; charset=utf-8"),...(resource.type==="application/zip"?{"Content-Disposition":"attachment; filename=mandate-contracts-v2.zip"}:{}),"Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: http://127.0.0.1:*; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","cache-control":"no-store"});res.end(readFileSync(resolve(options.staticDirectory,resource.file)));
    }catch(error){response(error instanceof MandateError&&error.code.includes("UNAUTHENTICATED")?401:400,{code:error instanceof MandateError?error.code:error instanceof z.ZodError?"WEB_INPUT_SCHEMA_INVALID":"WEB_OPERATION_UNAVAILABLE"});}
  });
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(options.port??0,"127.0.0.1",resolve);});const address=server.address();if(!address||typeof address==="string")throw new Error("WEB_BIND_FAILED");origin=`http://127.0.0.1:${address.port}`;
  return {origin,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};
}
