import {createServer} from "node:http";
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from "node:fs";
import {dirname} from "node:path";
import {z} from "zod";
import type {SessionController} from "./controller.js";
import {ControllerRequestSchema,verifyStatement,signControllerRequest,envelopeHash,type Envelope,type ControllerRequest} from "./controller-model.js";
import {CheckpointSchema,type Checkpoint} from "./checkpoint.js";
import {SafeHttp} from "../services/http.js";
import {canonicalJson,MandateError} from "../sdk/model.js";
import {keccak256,toHex,type Address,type LocalAccount,type Hex} from "viem";
const queryBody=z.object({request:ControllerRequestSchema}).strict(),anchorBody=z.object({request:ControllerRequestSchema,checkpoint:CheckpointSchema}).strict();
export async function serveController(controller:SessionController,port=0){
  let origin="";const server=createServer(async(req,res)=>{
    const reply=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==new URL(origin).host)return reply(400,{code:"CONTROLLER_HOST_MISMATCH"});
      if(req.method==="GET"&&req.url==="/status")return reply(200,await controller.inspect());
      if(req.method!=="POST"||!["/query","/anchor"].includes(req.url??""))return reply(404,{code:"CONTROLLER_ROUTE_UNSUPPORTED"});
      const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{code:"CONTROLLER_REQUEST_TOO_LARGE"});chunks.push(chunk);}
      const raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const response=req.url==="/query"?await controller.runQuery(queryBody.parse(raw).request):await controller.anchor(anchorBody.parse(raw).request,anchorBody.parse(raw).checkpoint);
      return reply(response.statement.outcome==="rejected"?403:200,response);
    }catch{return reply(400,{code:"CONTROLLER_REQUEST_INVALID"});}
  });
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});const address=server.address();if(!address||typeof address==="string")throw new Error("CONTROLLER_BIND_FAILED");origin=`http://127.0.0.1:${address.port}`;
  const timer=setInterval(()=>{void controller.inspect().catch(()=>{});},1000);timer.unref();
  return {origin,close:async()=>{clearInterval(timer);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};
}
export class ControllerClient {
  private requests=new Map<string,ControllerRequest>();
  constructor(readonly origin:string,readonly envelope:Envelope,readonly signer:Pick<LocalAccount,"signTypedData">,readonly expectedController:Address,readonly http=new SafeHttp({allowOrigins:[origin]}),readonly requestJournalFile?:string){if(requestJournalFile&&existsSync(requestJournalFile))for(const value of Object.values(JSON.parse(readFileSync(requestJournalFile,"utf8")))){const r=ControllerRequestSchema.parse(value);this.requests.set(r.envelopeHash+":"+r.requestId.toLowerCase(),r);}}
  async anchor(checkpoint:Checkpoint){
    const now=Math.floor(Date.now()/1000),p=this.envelope.payload;if(p.mode==="live"&&checkpoint.header.kind==="pre-payment"&&(now<p.startsAt||now>=p.expiresAt||now>p.startsAt+p.checkpointDeadlineSeconds))throw new MandateError("CONTROLLER_PRE_CHECKPOINT_GATE_EXPIRED");
    const request=await signControllerRequest(this.signer,this.envelope,{requestId:keccak256(toHex("anchor:"+checkpoint.root)),stepId:checkpoint.header.stepId,issuedAt:Math.floor(Date.now()/1000),kind:"anchor",payloadHash:keccak256(toHex(canonicalJson(checkpoint)))});
    const response=await this.http.json(this.origin+"/anchor",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.from(canonicalJson({request,checkpoint}))});const result=response.data as {statement:unknown};const statement=await verifyStatement(result.statement,this.expectedController,this.envelope.payload.scope);
    if(statement.envelopeHash!==request.envelopeHash||statement.requestId!==request.requestId||statement.kind!=="anchor"||!["allowed","detected"].includes(statement.outcome)||statement.details.root!==checkpoint.root||(checkpoint.header.kind==="pre-payment"&&this.envelope.payload.mode==="live"&&statement.outcome!=="allowed"))throw new MandateError("CONTROLLER_ANCHOR_NOT_ACCEPTED");return statement;
  }
  async query(stepId:Hex,requestId:Hex){
    const key=envelopeHash(this.envelope)+":"+requestId.toLowerCase();let request=this.requests.get(key);
    if(request){if(request.stepId!==stepId)throw new MandateError("CONTROLLER_CLIENT_REQUEST_FROZEN");}
    else{request=await signControllerRequest(this.signer,this.envelope,{requestId,stepId,issuedAt:Math.floor(Date.now()/1000),kind:"query",payloadHash:keccak256(toHex("null"))});this.requests.set(key,request);if(this.requestJournalFile){mkdirSync(dirname(this.requestJournalFile),{recursive:true,mode:0o700});writeFileSync(this.requestJournalFile+".tmp",canonicalJson(Object.fromEntries(this.requests)),{mode:0o600});renameSync(this.requestJournalFile+".tmp",this.requestJournalFile);}}
    const response=await this.http.json(this.origin+"/query",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.from(canonicalJson({request}))});const result=response.data as {statement:unknown;result:unknown},statement=await verifyStatement(result.statement,this.expectedController,this.envelope.payload.scope);
    if(statement.envelopeHash!==request.envelopeHash||statement.requestId!==request.requestId||statement.kind!=="query")throw new MandateError("CONTROLLER_QUERY_RESPONSE_MISMATCH");
    if(["completed","failed"].includes(statement.outcome)&&statement.details.resultDigest!==keccak256(toHex(canonicalJson(result.result))))throw new MandateError("CONTROLLER_QUERY_RESULT_DIGEST_MISMATCH");
    return {...result,statement};
  }
}
