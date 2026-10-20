// Controlled honest baseline: shared durable idempotency + local budget, no chain agent policy.
import {x402Client} from "@x402/core/client";
import {encodePaymentSignatureHeader,decodePaymentResponseHeader} from "@x402/core/http";
import type {Network,PaymentPayload,PaymentRequirements} from "@x402/core/types";
import {getAbiItem,keccak256,toHex,type Hex} from "viem";
import {PurchaseStore,businessKey,type PurchaseRecord} from "../services/store.js";
import {SafeHttp} from "../services/http.js";
import {fetchQuote} from "../services/quote.js";
import {reconcilePayment,tokenReadAbi} from "../sdk/reader.js";
import {canonicalJson,requestHash,nonceFor,decodePayment,authorizationTypes} from "../sdk/model.js";
import {verifyReceipt} from "../evidence/signed-artifacts.js";
import type {localEnvironment} from "../examples/local-environment.js";
import type {ApprovedService} from "../services/client.js";
type Environment=Awaited<ReturnType<typeof localEnvironment>>;
export class EOABaselineClient {
  constructor(readonly e:Environment,readonly store:PurchaseStore,readonly http:SafeHttp,readonly services:ApprovedService[],readonly agentId:string){}
  async reconcile(record:PurchaseRecord){
    if(!record.payment)return record;const p=decodePayment(record.payment);
    if(!record.settlementHash&&await this.e.pc.readContract({address:this.e.asset,abi:tokenReadAbi,functionName:"authorizationState",args:[this.e.agentA.address,p.nonce]})){
      const logs=await this.e.pc.getLogs({address:this.e.asset,event:getAbiItem({abi:tokenReadAbi,name:"AuthorizationUsed"}),args:{authorizer:this.e.agentA.address,nonce:p.nonce},fromBlock:0n,toBlock:"latest",strict:true});record.settlementHash=logs[0]?.transactionHash??undefined;
    }
    const proof=await reconcilePayment(this.e.pc,this.e.agentA.address,this.e.asset,p,record.settlementHash,1);if(proof.state==="paid"){record.paymentState="paid";record.settlementHash=proof.transactionHash;record.settlementBlockHash=proof.blockHash;}else if(proof.state==="consumed_unknown")record.paymentState="consumed_unknown";return record;
  }
  async call(id:Hex){
    const service=this.services.find(s=>s.serviceId===id);if(!service)throw Error("EOA_SERVICE_SCOPE_REJECTED");const e=this.e,key=businessKey(31337,e.agentA.address,e.root,service.stepId);
    let record=this.store.create({key,requestHash:requestHash(service),agentId:this.agentId,chainId:31337,wallet:e.agentA.address,mandateId:e.root,stepId:service.stepId,paymentState:"draft",serviceState:"not_requested",resultState:"unchecked"});
    const lease=this.store.claim(key,120000);if(!lease)return record;
    const save=()=>this.store.save(record,lease);
    try{
      record=await this.reconcile(record);if(record.paymentState==="paid"&&record.serviceState==="returned"){save();return record;}
      if(!record.payment){
        const budgetLease=this.store.claim("eoa-budget:"+e.root,120000);if(!budgetLease)return record;
        try{
          const quote=await fetchQuote(this.http,{method:service.method,url:service.url,body:service.body},{chainId:31337,asset:e.asset,payTo:e.merchantSigner.address,domainName:"USDC",domainVersion:"2",maxAmount:100000n,approvedRequestHash:record.requestHash,quoteSigner:e.merchantSigner.address,quoteIdentitySource:"explicit-auditor-configuration"},{discoveryOnly:true}),value=BigInt(quote.requirements.amount);
          const occupied=this.store.all().filter(r=>r.wallet.toLowerCase()===e.agentA.address.toLowerCase()&&r.mandateId===e.root&&r.payment&&r.paymentState!=="released").reduce((n,r)=>n+BigInt(r.payment!.value),0n);
          if(occupied+value>150000n){record.paymentState="rejected";record.errorCode="EOA_LOCAL_AGGREGATE_BUDGET_EXCEEDED";save();return record;}
          const now=(await e.pc.getBlock()).timestamp;record.quote=JSON.parse(JSON.stringify(quote));record.payment={mandateId:e.root,policyVersion:"1",sessionId:e.sessions[0],sessionEpoch:"1",stepId:service.stepId,merchantId:e.root,requestHash:record.requestHash,quoteHash:quote.quoteHash,to:e.merchantSigner.address,value:String(value),validAfter:"0",validBefore:String(now+300n),nonce:nonceFor(31337,e.agentA.address,e.root,service.stepId)};record.paymentState="reserved";save();
        }finally{this.store.release(budgetLease);}
      }
      const p=decodePayment(record.payment),quote=record.quote as Awaited<ReturnType<typeof fetchQuote>>;
      if(!record.payload){
        const authorization={from:e.agentA.address,to:p.to,value:String(p.value),validAfter:"0",validBefore:String(p.validBefore),nonce:p.nonce};
        const signature=await e.agentA.signTypedData({domain:{name:"USDC",version:"2",chainId:31337,verifyingContract:e.asset},types:authorizationTypes,primaryType:"TransferWithAuthorization",message:{...authorization,value:p.value,validAfter:0n,validBefore:p.validBefore}});
        const core=new x402Client().setSpendControls({allowedAssets:[{network:"eip155:31337",asset:e.asset,maxAmountPerPayment:"100000"}]}).register("eip155:31337" as Network,{scheme:"exact",createPaymentPayload:async()=>({x402Version:2,payload:{signature,authorization}})});
        record.payload=JSON.parse(JSON.stringify(await core.createPaymentPayload({x402Version:2,resource:quote.resource,accepts:[quote.requirements as PaymentRequirements]})));save();
      }
      record.paymentState=record.paymentState==="paid"?"paid":"pending";save();
      const response=await this.http.request(service.url,{method:service.method,headers:{"PAYMENT-SIGNATURE":encodePaymentSignatureHeader(record.payload as PaymentPayload)}});record.lastHttpStatus=response.status;
      const header=response.headers["payment-response"];let receipt:unknown;
      if(typeof header==="string"){const decoded=decodePaymentResponseHeader(header);if(/^0x[0-9a-fA-F]{64}$/.test(decoded.transaction))record.settlementHash=decoded.transaction as Hex;receipt=(decoded.extensions?.["offer-receipt"] as any)?.info?.receipt;}
      if(response.status>=200&&response.status<300){record.result=JSON.parse(response.body.toString());record.serviceState="returned";record.resultState=service.checkResult(record.result)?"valid":"invalid";delete record.errorCode;}else{record.serviceState="failed";record.errorCode="SERVICE_HTTP_"+response.status;}
      record=await this.reconcile(record);
      if(receipt){try{await verifyReceipt(receipt,{network:"eip155:31337",resourceUrl:service.url,payer:e.agentA.address,transaction:record.settlementHash,observedAt:Number((await e.pc.getBlock()).timestamp),minIssuedAt:0,binding:{resourceUrl:service.url,signer:e.merchantSigner.address,validFrom:0,source:"explicit-auditor-configuration"}});record.receiptEvidence={status:"confirmed",coversPaymentAmount:false,coversRequestBody:false,coversResultBody:false};}catch{record.receiptEvidence={status:"contradicted",code:"EOA_RECEIPT_INVALID",coversPaymentAmount:false,coversRequestBody:false,coversResultBody:false};}}
      save();return record;
    }catch{record.errorCode="EOA_BASELINE_TRANSPORT_UNKNOWN";if(record.payload)record.serviceState="unknown";save();return record;}
    finally{this.store.release(lease);}
  }
}
