import {z} from "zod";
import {keccak256,toHex,type Hex,type Address} from "viem";
import {PurchaseClient} from "../services/client.js";
import {BazaarClient,filterService} from "../services/catalog.js";
import {businessKey,type PurchaseRecord} from "../services/store.js";
import {draftOwnerAction} from "../sdk/owner.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {atomicAmount,canonicalJson,MandateError} from "../sdk/model.js";
import {expectedStats} from "../services/datasets.js";
import {OwnerStatus} from "./owner-status.js";
import {tokenReadAbi} from "../sdk/reader.js";
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(x=>x as Hex),empty=z.object({}).strict();
export const toolSchemas={
  mandate_get_context:empty,
  mandate_request_authorization:z.object({taskDescription:z.string().trim().min(1).max(1000),budgetAtomic:z.string().regex(/^[1-9][0-9]*$/),maxPerPaymentAtomic:z.string().regex(/^[1-9][0-9]*$/),ttlSeconds:z.number().int().min(60).max(86400).default(3600)}).strict(),
  mandate_search_services:z.object({query:z.string().trim().min(1).max(300),limit:z.number().int().min(1).max(20).default(10)}).strict(),
  mandate_quote_service:z.object({serviceId:hash}).strict(),
  mandate_call_service:z.object({serviceId:hash}).strict(),
  mandate_get_task:empty,
  mandate_get_receipt:z.object({serviceId:hash}).strict(),
  mandate_request_revoke:empty,
} as const;
export type ToolName=keyof typeof toolSchemas;
export const toolDescriptions:Record<ToolName,string>={
  mandate_get_context:"Read the authenticated agent identity, grant and chain budget. Tool connection does not authorize funds.",
  mandate_request_authorization:"Prepare an unsigned owner action for review. Does not sign, broadcast or activate authority.",
  mandate_search_services:"Discover untrusted Bazaar metadata and approved local services. Discovery is not payment approval.",
  mandate_quote_service:"Read live payment requirements for a configured service; return scope and price checks without paying.",
  mandate_call_service:"Purchase one owner-approved task step; resume its original parameters and nonce on retry.",
  mandate_get_task:"Read payment, delivery and result status independently for the configured task.",
  mandate_get_receipt:"Export a redacted receipt for a configured service; no private key, connection token or payment signature.",
  mandate_request_revoke:"Prepare an unsigned owner transaction revoking this agent grant. Only chain confirmation makes it effective.",
};
export function publicPurchase(record:PurchaseRecord){
  const {payload,quote,result,registrationSignature,...rest}=record;
  // Only this owner-approved public demo dataset has a model-facing projection.
  const validatedResultSummary=record.resultState==="valid"?["ETH","BTC"].map(asset=>expectedStats(asset as "ETH"|"BTC")).find(value=>result!==undefined&&canonicalJson(value)===canonicalJson(result)):undefined;
  return {...rest,resultDigest:validatedResultSummary&&result?keccak256(toHex(canonicalJson(result))):undefined,validatedResultSummary};
}
export class GatewayTools {
  readonly ownerStatus:OwnerStatus;
  constructor(readonly purchase:PurchaseClient,readonly catalog?:BazaarClient,readonly authorizeConnection?:()=>void) {this.ownerStatus=new OwnerStatus(purchase.reader,purchase.store,purchase.transactions.confirmations);}
  async call(name:ToolName,input:unknown):Promise<unknown> {
    this.authorizeConnection?.();
    if(!Object.hasOwn(toolSchemas,name))throw new MandateError("TOOL_UNSUPPORTED");
    const args=toolSchemas[name].parse(input),{context,reader,store}=this.purchase;
    const budget=await reader.readBudget(context.mandateId,context.sessionId);
    switch(name) {
      case "mandate_get_context":return {schemaVersion:2,agentId:context.agentId,wallet:reader.wallet,chainId:reader.chainId,asset:reader.tokenDomain.verifyingContract,mandateId:context.mandateId,sessionId:context.sessionId,policy:budget.policy,grant:budget.session,rootAvailable:budget.rootAvailable,grantAvailable:budget.grantAvailable,walletBalanceAtomic:await reader.pc.readContract({address:reader.tokenDomain.verifyingContract,abi:tokenReadAbi,functionName:"balanceOf",args:[reader.wallet]}),configuredServiceIds:context.services.map(s=>s.serviceId),scopeNote:"Configured services are this Gateway's allowlist, not an enumeration of all on-chain grant steps. A purchase must satisfy both scopes. Available budget is a limit, not a funded balance.",identitySource:"gateway-configuration",fundAuthoritySource:"chain",ownerKeyHeldByGateway:false};
      case "mandate_request_authorization": {
        const p=toolSchemas.mandate_request_authorization.parse(args),owner=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"owner"});
        const merchants:{id:Hex;payTo:Address;quoteSigner:Address}[]=[],steps:{id:Hex;merchantId:Hex;requestHash:Hex}[]=[];
        for(const service of context.services) {
          const step=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getStep",args:[context.mandateId,budget.policy.version,service.stepId]});
          const merchant=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"getMerchant",args:[context.mandateId,budget.policy.version,step.merchantId]});
          if(step.id==="0x"+"00".repeat(32))throw new MandateError("OWNER_SERVICE_CONFIGURATION_REQUIRED");
          if(!merchants.some(m=>m.id===merchant.id))merchants.push(merchant);steps.push(step);
        }
        const amount=atomicAmount(p.budgetAtomic);if(amount<budget.policy.occupied)throw new MandateError("BUDGET_BELOW_OCCUPANCY");
        const expiresAt=Number((await reader.pc.getBlock()).timestamp)+p.ttlSeconds;
        const action=draftOwnerAction(reader.chainId,owner,reader.wallet,{action:"replace",id:context.mandateId,limits:{budget:p.budgetAtomic,maxPerPayment:p.maxPerPaymentAtomic,expiresAt},merchants,steps});
        const approvalRequest=await this.ownerStatus.create(action,{mandateId:context.mandateId,sessionId:context.sessionId,requestedBy:context.agentId});
        return {...action,status:"draft",requestType:"limits-update-for-existing-task",requestedDescription:p.taskDescription,chainTaskHash:budget.policy.taskHash,chainActive:false,approvalRequest,followUp:"Replacement increments policy version; owner must approve a fresh grant/session configuration before this agent can execute."};
      }
      case "mandate_search_services": {
        const q=toolSchemas.mandate_search_services.parse(args);
        const configured=context.services.map(s=>({serviceId:s.serviceId,url:s.url,method:s.method,source:"owner-configured",metadataTrust:"user-approved-request-scope"}));
        if(!this.catalog)return {configured,catalog:{status:"not-configured"}};
        const snapshot=await this.catalog.search({query:q.query,limit:q.limit});
        const candidates=snapshot.items.map(item=>({resource:item.resource,description:item.description,metadataTrust:"untrusted-directory",...filterService(item,{chainId:reader.chainId,asset:reader.tokenDomain.verifyingContract,maxPerPayment:budget.policy.maxPerPayment,approvedPayTo:[],approvedUrls:context.services.map(s=>s.url),verifiedFacilitator:false})}));
        return {configured,catalog:{sourceUrl:snapshot.sourceUrl,receivedAt:snapshot.receivedAt,stale:snapshot.stale,candidates,partialResults:snapshot.partialResults}};
      }
      case "mandate_quote_service": {const p=toolSchemas.mandate_quote_service.parse(args),q=await this.purchase.quote(p.serviceId);return {schemaVersion:2,serviceId:p.serviceId,requirements:q.quote.requirements,requestHash:q.quote.requestHash,quoteHash:q.quote.quoteHash,evidenceLevel:q.quote.evidenceLevel,readyForRegistration:false,rootAvailable:q.budget.rootAvailable,grantAvailable:q.budget.grantAvailable};}
      case "mandate_call_service":return publicPurchase(await this.purchase.call(toolSchemas.mandate_call_service.parse(args).serviceId));
      case "mandate_get_task": {
        const records=[];
        for(const r of store.all().filter(r=>r.mandateId===context.mandateId&&r.wallet.toLowerCase()===reader.wallet.toLowerCase()&&r.chainId===reader.chainId)){const view=await this.purchase.readRecord(r.key);records.push({...publicPurchase(view.record),refresh:view.refresh});}
        return {schemaVersion:2,mandateId:context.mandateId,records,ownerRequests:await this.ownerStatus.list(context.mandateId,context.sessionId)};
      }
      case "mandate_get_receipt": {
        const p=toolSchemas.mandate_get_receipt.parse(args),service=context.services.find(s=>s.serviceId===p.serviceId);if(!service)throw new MandateError("SERVICE_SCOPE_APPROVAL_REQUIRED");
        const key=businessKey(reader.chainId,reader.wallet,context.mandateId,service.stepId);if(!store.get(key))throw new MandateError("RECEIPT_NOT_FOUND");const view=await this.purchase.readRecord(key);return {schemaVersion:2,source:"local-state-and-chain",refresh:view.refresh,record:publicPurchase(view.record)};
      }
      case "mandate_request_revoke": {const owner=await reader.pc.readContract({address:reader.wallet,abi:accountAbi,functionName:"owner"}),action=draftOwnerAction(reader.chainId,owner,reader.wallet,{action:"revokeSession",id:context.mandateId,sessionId:context.sessionId});return {...action,status:"draft",chainActive:budget.session.exists&&!budget.session.revoked,approvalRequest:await this.ownerStatus.create(action,{mandateId:context.mandateId,sessionId:context.sessionId,requestedBy:context.agentId})};}
    }
  }
}
