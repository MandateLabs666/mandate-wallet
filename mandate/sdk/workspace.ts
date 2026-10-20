import {randomBytes} from "node:crypto";
import {z} from "zod";
import {keccak256,toHex,type Address,type Hex} from "viem";
import {accountAbi} from "./accountAbi.js";
import {tokenReadAbi} from "./reader.js";
import {draftOwnerAction,type OwnerActionInput} from "./owner.js";
import {canonicalJson,atomicAmount,decodePayment,MandateError} from "./model.js";
import {PurchaseClient} from "../services/client.js";
import {GatewayTools} from "../gateway/tools.js";
import {PurchaseEvidenceRecorder} from "../evidence/recorder.js";
import {businessKey} from "../services/store.js";
import {exportRecordedBundle,type VerifierTrust} from "../evidence/bundle.js";
import {checkVerificationProfile,type VerificationProfile} from "./verification-profile.js";

const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v.toLowerCase() as Hex);
const limits=z.object({budgetAtomic:z.string().regex(/^[1-9][0-9]*$/),maxPerPaymentAtomic:z.string().regex(/^[1-9][0-9]*$/),ttlSeconds:z.number().int().min(60).max(86400)}).strict();
export const WorkspaceCreateSchema=limits.extend({description:z.string().trim().min(1).max(500)}).strict();
export const WorkspaceActionSchema=z.discriminatedUnion("action",[
  limits.extend({action:z.literal("replace"),taskId:hash}).strict(),
  limits.extend({action:z.literal("grant"),taskId:hash}).strict(),
  z.object({action:z.literal("pause"),taskId:hash,paused:z.boolean()}).strict(),
  z.object({action:z.literal("revoke"),taskId:hash}).strict(),
  z.object({action:z.literal("revokeSession"),taskId:hash}).strict(),
]);
type Template={merchants:{id:Hex;payTo:Address;quoteSigner:Address}[];steps:{id:Hex;merchantId:Hex;requestHash:Hex}[]};
export type WorkspaceTask={id:Hex;sessionId:Hex;description:string;startBlock:string;template:Template};
const freshId=()=>keccak256(randomBytes(32));
// Web and CLI adapt the same purchase/owner state machines used by MCP.
// No owner key is accepted or stored here.
export class MandateWorkspace {
  private constructor(readonly base:GatewayTools,readonly verification?:VerificationProfile){}
  static async create(base:GatewayTools,verification?:unknown){
    const profile=verification?await checkVerificationProfile(base.purchase.reader,verification):undefined;
    const workspace=new MandateWorkspace(base,profile),{store,context,reader}=base.purchase;
    if(await reader.pc.readContract({address:reader.tokenDomain.verifyingContract,abi:tokenReadAbi,functionName:"decimals"})!==6)throw new MandateError("WORKSPACE_ASSET_DECIMALS_UNSUPPORTED");
    store.db.exec("CREATE TABLE IF NOT EXISTS workspace_tasks(id TEXT PRIMARY KEY,json TEXT NOT NULL)");
    if(!workspace.get(context.mandateId)){
      const {policy}=await reader.readBudget(context.mandateId,context.sessionId),template=await workspace.readTemplate(context.mandateId,policy.version);
      workspace.insert({id:context.mandateId,sessionId:context.sessionId,description:"Configured agent task",startBlock:context.startBlock.toString(),template});
    }
    return workspace;
  }
  get(id:Hex):WorkspaceTask|undefined{
    const row=this.base.purchase.store.db.prepare("SELECT json FROM workspace_tasks WHERE id=?").get(id.toLowerCase()) as {json:string}|undefined;
    return row?JSON.parse(row.json):undefined;
  }
  list(){return (this.base.purchase.store.db.prepare("SELECT json FROM workspace_tasks ORDER BY id").all() as {json:string}[]).map(r=>JSON.parse(r.json) as WorkspaceTask);}
  private insert(task:WorkspaceTask){this.base.purchase.store.db.prepare("INSERT INTO workspace_tasks VALUES(?,?)").run(task.id.toLowerCase(),canonicalJson(task));}
  private save(task:WorkspaceTask){this.base.purchase.store.db.prepare("UPDATE workspace_tasks SET json=? WHERE id=?").run(canonicalJson(task),task.id.toLowerCase());}
  private required(id:Hex){const task=this.get(hash.parse(id));if(!task)throw new MandateError("WORKSPACE_TASK_NOT_CONFIGURED");return task;}
  private async readTemplate(id:Hex,version:bigint):Promise<Template>{
    const {reader,context}=this.base.purchase,merchants:Template["merchants"]=[],steps:Template["steps"]=[];
    for(const service of context.services){
      const step=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getStep",args:[id,version,service.stepId]});
      if(step.id==="0x"+"00".repeat(32))throw new MandateError("OWNER_SERVICE_CONFIGURATION_REQUIRED");
      const merchant=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getMerchant",args:[id,version,step.merchantId]});
      if(!merchants.some(m=>m.id===merchant.id))merchants.push(merchant);steps.push(step);
    }
    return {merchants,steps};
  }
  private async owner(){return this.base.purchase.reader.pc.readContract({address:this.base.purchase.reader.wallet,abi:accountAbi,functionName:"owner"});}
  private async track(task:WorkspaceTask,input:OwnerActionInput,sessionId=task.sessionId){
    this.base.authorizeConnection?.();
    const {reader}=this.base.purchase,draft=draftOwnerAction(reader.chainId,await this.owner(),reader.wallet,input);
    try{await reader.pc.call({account:draft.transaction.from,to:reader.wallet,data:draft.transaction.data,value:0n});}catch{throw new MandateError("OWNER_ACTION_SIMULATION_FAILED");}
    const request=await this.base.ownerStatus.create(draft,{mandateId:task.id,sessionId,requestedBy:"owner-web-workspace"});
    return {request,input,requiresOwnerWallet:true};
  }
  async draftCreate(input:unknown){
    this.base.authorizeConnection?.();if(this.list().length>=64)throw new MandateError("WORKSPACE_TASK_COUNT_LIMIT");const args=WorkspaceCreateSchema.parse(input),seed=this.required(this.base.purchase.context.mandateId),{reader}=this.base.purchase;
    // A configured controller must get a separately owner-approved envelope.
    if(this.base.purchase.evidence?.controller)throw new MandateError("WORKSPACE_CONTROLLER_RECONFIGURATION_REQUIRED");
    atomicAmount(args.budgetAtomic);atomicAmount(args.maxPerPaymentAtomic);
    const expiresAt=Number((await reader.pc.getBlock()).timestamp)+args.ttlSeconds,task:WorkspaceTask={id:freshId(),sessionId:freshId(),description:args.description,startBlock:String(await reader.pc.getBlockNumber({cacheTime:0})),template:seed.template};
    const action:OwnerActionInput={action:"create",id:task.id,taskHash:keccak256(toHex(args.description)),limits:{budget:args.budgetAtomic,maxPerPayment:args.maxPerPaymentAtomic,expiresAt},...task.template};
    // Validate before persisting an invalid task or asking a wallet to sign.
    draftOwnerAction(reader.chainId,await this.owner(),reader.wallet,action);this.insert(task);
    return {task,...await this.track(task,action)};
  }
  async draftAction(input:unknown){
    this.base.authorizeConnection?.();const args=WorkspaceActionSchema.parse(input),task=this.required(args.taskId),{reader,context}=this.base.purchase;
    const {policy,session}=await reader.readBudget(task.id,task.sessionId);let action:OwnerActionInput,sessionId=task.sessionId;
    if(args.action==="replace"){
      if(atomicAmount(args.budgetAtomic)<policy.occupied)throw new MandateError("BUDGET_BELOW_OCCUPANCY");
      action={action:"replace",id:task.id,limits:{budget:args.budgetAtomic,maxPerPayment:args.maxPerPaymentAtomic,expiresAt:Number((await reader.pc.getBlock()).timestamp)+args.ttlSeconds},...task.template};
    }else if(args.action==="grant"){
      if(this.base.purchase.evidence?.controller)throw new MandateError("WORKSPACE_CONTROLLER_RECONFIGURATION_REQUIRED");
      sessionId=session.exists?freshId():task.sessionId;
      const expiry=Number((await reader.pc.getBlock()).timestamp)+args.ttlSeconds;
      if(atomicAmount(args.budgetAtomic)>policy.budget||atomicAmount(args.maxPerPaymentAtomic)>policy.maxPerPayment||BigInt(expiry)>policy.expiresAt)throw new MandateError("GRANT_EXCEEDS_OWNER_POLICY");
      action={action:"grant",id:task.id,sessionId,signer:context.signer.address,budget:args.budgetAtomic,maxPerPayment:args.maxPerPaymentAtomic,expiresAt:expiry,steps:task.template.steps.map(s=>s.id)};
    }else if(args.action==="pause")action={action:"pause",id:task.id,paused:args.paused};
    else if(args.action==="revokeSession")action={action:"revokeSession",id:task.id,sessionId};
    else action={action:"revoke",id:task.id};
    return {task,...await this.track(task,action,sessionId)};
  }
  async ownerRequest(id:Hex){
    this.base.authorizeConnection?.();id=hash.parse(id);const request=this.base.ownerStatus.get(id);
    if(!request||!this.get(request.mandateId))throw new MandateError("WORKSPACE_OWNER_REQUEST_NOT_FOUND");
    return this.base.ownerStatus.reconcile(id);
  }
  async noteOwnerBroadcast(id:Hex,transactionHash:Hex){id=hash.parse(id);await this.ownerRequest(id);return this.base.ownerStatus.noteBroadcast(id,hash.parse(transactionHash));}
  private async tools(id:Hex){
    const task=this.required(id),{reader,store,transactions,http,evidence,context}=this.base.purchase;
    const grants=(await this.base.ownerStatus.list(task.id)).filter(r=>r.draft.action==="grant"&&r.actionApplied&&r.status==="confirmed").sort((a,b)=>Number(BigInt(b.blockNumber??"0")-BigInt(a.blockNumber??"0")));
    if(grants[0]&&grants[0].sessionId!==task.sessionId){task.sessionId=grants[0].sessionId;this.save(task);}
    const next={...context,mandateId:task.id,sessionId:task.sessionId,startBlock:BigInt(task.startBlock)};
    if(evidence?.controller&&(next.mandateId!==context.mandateId||next.sessionId!==context.sessionId))throw new MandateError("WORKSPACE_CONTROLLER_RECONFIGURATION_REQUIRED");
    const recorder=evidence?new PurchaseEvidenceRecorder(evidence.journal,reader,next,evidence.controller):undefined;
    return new GatewayTools(new PurchaseClient(next,reader,transactions,http,store,recorder),this.base.catalog,this.base.authorizeConnection);
  }
  async snapshot(id:Hex){
    this.base.authorizeConnection?.();const tools=await this.tools(id),task=this.required(id),{reader}=tools.purchase;
    const state=await tools.call("mandate_get_task",{}),context=await tools.call("mandate_get_context",{}),block=await reader.pc.getBlock();
    return {schemaVersion:2,task,tasks:this.list(),context,state,ownerRequests:await this.base.ownerStatus.list(task.id),owner:await this.owner(),observedBlock:String(block.number),observedAt:String(block.timestamp),evidenceCapabilities:{verificationConfigured:!!this.verification,disclosurePolicy:this.verification?.disclosurePolicy??{request:false,result:false}},dataMode:reader.chainId===31337?"local-EVM-test":"public-testnet",tokenDecimals:6,services:tools.purchase.context.services.map(s=>({serviceId:s.serviceId,stepId:s.stepId,url:s.url,method:s.method})),limits:["Gateway service allowlist is not the full chain grant scope.","Budget availability is not token cash.","Owner signing requires an external wallet; the server holds no owner key."]};
  }
  async call(id:Hex,serviceId:Hex){return (await this.tools(id)).call("mandate_call_service",{serviceId:hash.parse(serviceId)});}
  async quote(id:Hex,serviceId:Hex){return (await this.tools(id)).call("mandate_quote_service",{serviceId:hash.parse(serviceId)});}
  async receipt(id:Hex,serviceId:Hex){return (await this.tools(id)).call("mandate_get_receipt",{serviceId:hash.parse(serviceId)});}
  async search(id:Hex,query:string){return (await this.tools(id)).call("mandate_search_services",{query});}
  async evidence(id:Hex,serviceId:Hex,disclosure:{request?:boolean;result?:boolean}={}){
    const tools=await this.tools(id),{reader,evidence,context}=tools.purchase,service=context.services.find(s=>s.serviceId===hash.parse(serviceId));
    if(!service)throw new MandateError("SERVICE_SCOPE_APPROVAL_REQUIRED");
    if(!evidence)throw new MandateError("EVIDENCE_JOURNAL_NOT_CONFIGURED");
    const allowed=this.verification?.disclosurePolicy??{request:false,result:false};
    if(disclosure.request&&!allowed.request||disclosure.result&&!allowed.result)throw new MandateError("DISCLOSURE_ADMIN_APPROVAL_REQUIRED");
    const {record}=await tools.purchase.readRecord(businessKey(reader.chainId,reader.wallet,context.mandateId,service.stepId));
    if(!record.payment)throw new MandateError("EVIDENCE_PAYMENT_NOT_REGISTERED");
    const p=decodePayment(record.payment),session=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getSession",args:[p.mandateId,p.sessionId]});
    const scope={chainId:reader.chainId,wallet:reader.wallet,mandateId:p.mandateId,sessionId:p.sessionId,policyVersion:String(p.policyVersion),sessionEpoch:String(p.sessionEpoch),signer:session.signer};
    return exportRecordedBundle(evidence.journal,reader,scope,record,p,{discloseRequest:disclosure.request,discloseResult:disclosure.result,discloseOnlyStep:p.stepId});
  }
  async evidenceTrust(id:Hex,serviceId:Hex):Promise<VerifierTrust>{
    if(!this.verification)throw new MandateError("TRUSTED_VERIFICATION_PROFILE_REQUIRED");
    const tools=await this.tools(id),{reader,context}=tools.purchase,service=context.services.find(s=>s.serviceId===hash.parse(serviceId));
    if(!service)throw new MandateError("SERVICE_SCOPE_APPROVAL_REQUIRED");
    const {record}=await tools.purchase.readRecord(businessKey(reader.chainId,reader.wallet,context.mandateId,service.stepId));
    if(!record.payment||!record.registrationBlock)throw new MandateError("EVIDENCE_REGISTRATION_NOT_CONFIRMED");
    const p=decodePayment(record.payment),blockNumber=BigInt(record.registrationBlock);
    const [policy,session,step]=await Promise.all([reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getPolicy",args:[p.mandateId],blockNumber}),reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getSession",args:[p.mandateId,p.sessionId],blockNumber}),reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getStep",args:[p.mandateId,p.policyVersion,p.stepId],blockNumber})]);
    const merchant=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getMerchant",args:[p.mandateId,p.policyVersion,step.merchantId],blockNumber});
    return {schemaVersion:2,chainId:reader.chainId,wallet:reader.wallet,asset:reader.tokenDomain.verifyingContract,walletRuntimeHash:this.verification.walletRuntimeHash,owner:this.verification.owner,mandateId:p.mandateId,sessionId:p.sessionId,sessionSigner:session.signer,merchantId:step.merchantId,merchantSigner:merchant.quoteSigner,payTo:merchant.payTo,resourceUrl:service.url,requestHash:step.requestHash,rootBudgetAtomic:String(policy.budget),maxPerPaymentAtomic:String(policy.maxPerPayment),startBlock:this.required(id).startBlock,rpcs:this.verification.rpcs,confirmations:tools.purchase.transactions.confirmations,resultChecker:service.url.includes("asset=ETH")?"ETH-stats-v2":service.url.includes("asset=BTC")?"BTC-stats-v2":"digest-only"};
  }
}
