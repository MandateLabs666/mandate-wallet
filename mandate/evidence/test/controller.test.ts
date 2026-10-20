import {it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {privateKeyToAccount} from "viem/accounts";
import {keccak256,toHex,type Hex} from "viem";
import {SessionController} from "../controller.js";
import {signEnvelope,signControllerRequest,verifyStatement,type Envelope} from "../controller-model.js";
import {signCheckpoint,ZERO_ROOT,type EvidenceScope} from "../checkpoint.js";
import {commitFields} from "../merkle.js";
import {serveController,ControllerClient} from "../controller-http.js";
import {SafeHttp} from "../../services/http.js";
import {canonicalJson} from "../../sdk/model.js";
const owner=privateKeyToAccount("0x"+"a1".repeat(32) as Hex),agent=privateKeyToAccount("0x"+"a2".repeat(32) as Hex),witness=privateKeyToAccount("0x"+"a3".repeat(32) as Hex),stranger=privateKeyToAccount("0x"+"a4".repeat(32) as Hex);
const scope:EvidenceScope={chainId:31337,wallet:owner.address,mandateId:keccak256(toHex("controller-root")),sessionId:keccak256(toHex("controller-session")),policyVersion:"1",sessionEpoch:"1",signer:agent.address},step=keccak256(toHex("step"));
async function setup(){let now=1000,calls=0;const envelope=await signEnvelope(owner,{schemaVersion:2,scope,mode:"live",stepIds:[step],maxQueriesPerStep:3,startsAt:1000,expiresAt:1100,checkpointDeadlineSeconds:20,expectedKinds:["pre-payment","registration","payment","service"]}),path=join(mkdtempSync(join(tmpdir(),"mandate-controller-")),"controller.sqlite"),factory=()=>SessionController.create(path,envelope,witness,async()=>({draw:++calls}),{owner:owner.address,scope},()=>now);return {envelope,path,factory,now:(value:number)=>{now=value;},calls:()=>calls};}
const request=(e:Envelope,id:number,kind:"query"|"anchor"="query",payload:unknown=null,stepId=step,issuedAt=1000)=>signControllerRequest(agent,e,{requestId:keccak256(toHex("request:"+id)),stepId,issuedAt,kind,payloadHash:keccak256(toHex(canonicalJson(payload)))});
it("owner approval, finite scope, atomic query charging and replay remain valid across restart",async()=>{
  const e=await setup();let controller=await e.factory();
  try{
    const one=await request(e.envelope,1),same=await controller.runQuery(one);expect(same.statement.outcome).toBe("completed");expect((await controller.runQuery(one)).result).toEqual(same.result);expect(e.calls()).toBe(1);
    await Promise.all([controller.runQuery(await request(e.envelope,2)),controller.runQuery(await request(e.envelope,3)),controller.runQuery(await request(e.envelope,4))]);expect(e.calls()).toBe(3);
    controller.close();controller=await e.factory();expect((await controller.runQuery(await request(e.envelope,5))).statement.code).toBe("CONTROLLER_QUERY_BUDGET_EXHAUSTED");expect(e.calls()).toBe(3);
    e.now(1200);expect((await controller.runQuery(one)).result).toEqual(same.result);expect((await controller.runQuery(await request(e.envelope,6))).statement.code).toBe("CONTROLLER_REQUEST_EXPIRED");
    await verifyStatement(same.statement,witness.address,scope);
    const bad=await signEnvelope(stranger,e.envelope.payload);await expect(SessionController.create(e.path,bad,witness,async()=>null,{owner:owner.address,scope})).rejects.toThrow("NOT_AUTHORIZED");
    await expect(SessionController.create(e.path,e.envelope,witness,async()=>null,{owner:owner.address,scope:{...scope,chainId:11155111}})).rejects.toThrow("NOT_AUTHORIZED");
    await expect(SessionController.create(e.path,e.envelope,witness,async()=>null,{owner:owner.address,scope:{...scope,wallet:stranger.address}})).rejects.toThrow("NOT_AUTHORIZED");
    await expect(SessionController.create(e.path,e.envelope,witness,async()=>null,{owner:owner.address,scope:{...scope,sessionId:keccak256(toHex("other-session"))}})).rejects.toThrow("NOT_AUTHORIZED");
  }finally{controller.close();}
});
it("wrong step, signer, stale request and changed replay payload are denied with signed decisions",async()=>{
  const e=await setup(),controller=await e.factory();
  try{
    const wrong=await request(e.envelope,1,"query",null,keccak256(toHex("other")));expect((await controller.runQuery(wrong)).statement.code).toBe("CONTROLLER_REQUEST_SCOPE_MISMATCH");
    const r=await request(e.envelope,2),forged=await signControllerRequest(stranger,e.envelope,{...r,signature:undefined} as any);expect((await controller.runQuery(forged)).statement.outcome).toBe("rejected");
    expect((await controller.runQuery(await request(e.envelope,3,"query",null,step,900))).statement.code).toBe("CONTROLLER_REQUEST_EXPIRED");
    await controller.runQuery(r);const changed=await request(e.envelope,2,"query",null,step,1001);expect((await controller.runQuery(changed)).statement.code).toBe("CONTROLLER_REPLAY_MISMATCH");expect(e.calls()).toBe(1);
  }finally{controller.close();}
});
it("external anchors detect a correctly re-signed fork and omission while unanchored replacement remains possible",async()=>{
  const e=await setup(),controller=await e.factory();
  try{
    const aTree=commitFields({request:"approved"}),bTree=commitFields({request:"rewritten"}),header={schemaVersion:2 as const,...scope,stepId:step,sequence:"0",kind:"pre-payment" as const,previousRoot:ZERO_ROOT,merkleRoot:aTree.root,leafCount:1,observedAt:"1000"},a=await signCheckpoint(agent,header),b=await signCheckpoint(agent,{...header,merkleRoot:bTree.root});
    expect((await controller.anchor(await request(e.envelope,1,"anchor",a),a)).statement.outcome).toBe("allowed");expect((await controller.anchor(await request(e.envelope,2,"anchor",b),b)).statement.code).toBe("CONTROLLER_CHECKPOINT_FORK");
    const crossChain=await signCheckpoint(agent,{...header,chainId:11155111});expect((await controller.anchor(await request(e.envelope,5,"anchor",crossChain),crossChain)).statement.code).toBe("CONTROLLER_CHECKPOINT_SCOPE_MISMATCH");
    e.now(1030);expect((await controller.anchor(await request(e.envelope,6,"anchor",a),a)).statement.code).toBe("PRE_CHECKPOINT_GATE_EXPIRED");const status=await controller.inspect();expect(status.alerts).toHaveLength(3);expect(status.alerts.every(a=>a.code==="EXPECTED_CHECKPOINT_MISSING")).toBe(true);
    const anchors=controller.exportAnchors();expect(anchors[0].checkpoint.root).toBe(a.root);await verifyStatement(anchors[0].statement,witness.address,scope);
    // A fresh, colluding/empty store can accept another first root. This is the
    // exact independence assumption, not a prevention claim.
    const replacement=await SessionController.create(join(mkdtempSync(join(tmpdir(),"unanchored-")),"db.sqlite"),e.envelope,witness,async()=>null,{owner:owner.address,scope},()=>1000);
    try{expect((await replacement.anchor(await request(e.envelope,3,"anchor",b),b)).statement.outcome).toBe("allowed");}finally{replacement.close();}
  }finally{controller.close();}
});
it("actual HTTP controller bounds its adapter; bypassed synthetic queries are not observable",async()=>{
  const now=Math.floor(Date.now()/1000),envelope=await signEnvelope(owner,{schemaVersion:2,scope,mode:"live",stepIds:[step],maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+60,checkpointDeadlineSeconds:30,expectedKinds:["pre-payment"]}),rows=[];
  for(const attempted of [1,5,20,100]){
    let calls=0;const controller=await SessionController.create(join(mkdtempSync(join(tmpdir(),"grinding-")),"db.sqlite"),envelope,witness,async()=>({draw:(++calls*13)%17}),{owner:owner.address,scope}),service=await serveController(controller),client=new ControllerClient(service.origin,envelope,agent,witness.address,new SafeHttp({allowOrigins:[service.origin],testLoopbackOrigins:[service.origin]}));
    try{
      for(let i=0;i<attempted;i++)await client.query(step,keccak256(toHex("http:"+i)));
      expect(calls).toBe(Math.min(attempted,3));let bypassed=0;for(let i=0;i<attempted;i++)void ((++bypassed*13)%17);expect(bypassed).toBe(attempted);
      rows.push({attempted,controlledAdapterCalls:calls,outOfBandSyntheticCalls:bypassed,controlledPath:"prevented excess queries",bypass:"not-guaranteed; not visible to controller"});
    }finally{await service.close();controller.close();}
  }
  mkdirSync("artifacts/m5/interference",{recursive:true});writeFileSync("artifacts/m5/interference/grinding.json",JSON.stringify({model:"synthetic deterministic pseudo-random adapter; not a real LLM benchmark",queryBudget:3,rows},null,2)+"\n");
});
it("client rejects a replayed signed response and a changed result body",async()=>{
  const now=Math.floor(Date.now()/1000),envelope=await signEnvelope(owner,{schemaVersion:2,scope,mode:"live",stepIds:[step],maxQueriesPerStep:3,startsAt:now-1,expiresAt:now+60,checkpointDeadlineSeconds:30,expectedKinds:["pre-payment"]});
  const directory=mkdtempSync(join(tmpdir(),"controller-response-"));let controllerNow=now;const controller=await SessionController.create(join(directory,"db.sqlite"),envelope,witness,async()=>({draw:7}),{owner:owner.address,scope},()=>controllerNow),server=await serveController(controller),http=new SafeHttp({allowOrigins:[server.origin],testLoopbackOrigins:[server.origin]});
  let saved:any,mode="normal";const original=http.json.bind(http);http.json=async(...args:Parameters<SafeHttp["json"]>)=>{const response=await original(...args);if(mode==="replay")return saved;if(mode==="tamper")return {...response,data:{...(response.data as any),result:{draw:8}}};saved=response;return response;};
  const client=new ControllerClient(server.origin,envelope,agent,witness.address,http,join(directory,"requests.json")),first=keccak256(toHex("response:first"));
  try{expect((await client.query(step,first)).result).toEqual({draw:7});mode="replay";await expect(client.query(step,keccak256(toHex("response:second")))).rejects.toThrow("RESPONSE_MISMATCH");mode="tamper";await expect(client.query(step,first)).rejects.toThrow("RESULT_DIGEST_MISMATCH");mode="normal";const resumed=new ControllerClient(server.origin,envelope,agent,witness.address,http,join(directory,"requests.json"));expect((await resumed.query(step,first)).result).toEqual({draw:7});controllerNow=now+61;const cp=await signCheckpoint(agent,{schemaVersion:2,...scope,stepId:step,sequence:"0",kind:"pre-payment",previousRoot:ZERO_ROOT,merkleRoot:commitFields({request:"late"}).root,leafCount:1,observedAt:String(now)});await expect(resumed.anchor(cp)).rejects.toThrow("ANCHOR_NOT_ACCEPTED");expect(controller.exportAnchors()).toHaveLength(1);}finally{await server.close();controller.close();}
});
