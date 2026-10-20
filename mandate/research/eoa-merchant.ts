// Ordinary x402 research endpoint. Production Mandate merchant rules stay unchanged.
import {createServer} from "node:http";
import {hashTypedData,keccak256,toHex,isAddressEqual,type Address,type Hex} from "viem";
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from "@x402/core/http";
import type {PaymentPayload,PaymentRequirements,SettleResponse} from "@x402/core/types";
import {PurchaseStore} from "../services/store.js";
import {canonicalJson,authorizationTypes,type Payment} from "../sdk/model.js";
import {reconcilePayment} from "../sdk/reader.js";
import {expectedStats} from "../services/datasets.js";
import {signOffer,signReceipt} from "../evidence/signed-artifacts.js";
import type {localEnvironment} from "../examples/local-environment.js";
type Environment=Awaited<ReturnType<typeof localEnvironment>>;
const zero=("0x"+"00".repeat(32)) as Hex;
export function receiptPayment(auth:{to:string;value:string;validAfter:string;validBefore:string;nonce:string}):Payment{
  // Receipt verification only consumes authorization fields; no on-chain EOA mandate is claimed.
  return {mandateId:zero,sessionId:zero,policyVersion:1n,sessionEpoch:1n,stepId:zero,merchantId:zero,requestHash:zero,quoteHash:zero,to:auth.to as Address,value:BigInt(auth.value),validAfter:0n,validBefore:BigInt(auth.validBefore),nonce:auth.nonce as Hex};
}
export async function startEOAMerchant(e:Environment,options:{priceAtomic:string;failAfterPayment:boolean}){
  const store=new PurchaseStore(e.directory+"/eoa-merchant.sqlite"),db=store.db;
  db.exec("CREATE TABLE eoa_orders(key TEXT PRIMARY KEY,resource TEXT,payload_hash TEXT,payload TEXT,settlement TEXT,result TEXT,receipt TEXT)");
  const requirements:PaymentRequirements={scheme:"exact",network:"eip155:31337",asset:e.asset,amount:options.priceAtomic,payTo:e.merchantSigner.address,maxTimeoutSeconds:300,extra:{name:"USDC",version:"2",assetTransferMethod:"eip3009"}};
  let origin="",failed=false,requests=0;
  const server=createServer(async(req,res)=>{
    const reply=(status:number,value:unknown,headers:Record<string,string>={})=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store",...headers});res.end(JSON.stringify(value));};
    try{
      requests++;const url=new URL(req.url??"/",origin),symbol=url.searchParams.get("asset");
      if(req.headers.host!==new URL(origin).host||req.method!=="GET"||url.pathname!=="/stats"||!["ETH","BTC"].includes(symbol??"")||[...url.searchParams.keys()].some(k=>k!=="asset"))return reply(404,{code:"RESOURCE_UNSUPPORTED"});
      const header=req.headers["payment-signature"];
      if(typeof header!=="string")return reply(402,{code:"PAYMENT_REQUIRED"},{"PAYMENT-REQUIRED":encodePaymentRequiredHeader({x402Version:2,resource:{url:url.href,description:"Fixed public dataset; ordinary EOA x402 research endpoint",mimeType:"application/json"},accepts:[requirements],extensions:{"offer-receipt":{info:{offers:[await signOffer(e.merchantSigner,{version:1,resourceUrl:url.href,scheme:"exact",network:requirements.network,asset:e.asset,payTo:e.merchantSigner.address,amount:requirements.amount,validUntil:Number((await e.pc.getBlock()).timestamp)+300},0)]}}}})});
      if(header.length>16000)return reply(400,{code:"PAYLOAD_TOO_LARGE"});
      const payload=decodePaymentSignatureHeader(header),a=(payload.payload as any).authorization;
      if(payload.x402Version!==2||payload.resource?.url!==url.href||canonicalJson(payload.accepted)!==canonicalJson(requirements)||!a||!isAddressEqual(a.from,e.agentA.address)||a.to.toLowerCase()!==e.merchantSigner.address.toLowerCase()||a.value!==requirements.amount||a.validAfter!=="0"||!/^0x[0-9a-fA-F]{64}$/.test(a.nonce))return reply(400,{code:"PAYLOAD_SCOPE_MISMATCH"});
      if((await e.pc.getCode({address:e.agentA.address}))!==undefined)return reply(400,{code:"PLAIN_EOA_REQUIRED"});
      const key=`31337:${e.asset}:${e.agentA.address}:${a.nonce}`,payloadHash=keccak256(toHex(canonicalJson(payload))),lease=store.claim(key,120000);if(!lease)return reply(409,{code:"ORDER_BUSY"});
      try{
        db.prepare("INSERT OR IGNORE INTO eoa_orders VALUES(?,?,?,?,NULL,NULL,NULL)").run(key,url.href,payloadHash,canonicalJson(payload));
        const row=db.prepare("SELECT * FROM eoa_orders WHERE key=?").get(key) as {resource:string;payload_hash:string;settlement?:string;result?:string;receipt?:string};
        if(row.resource!==url.href||row.payload_hash!==payloadHash)return reply(409,{code:"ORDER_REUSE_MISMATCH"});
        let settlement:SettleResponse|undefined=row.settlement?JSON.parse(row.settlement):undefined;
        if(settlement){const proof=await reconcilePayment(e.pc,e.agentA.address,e.asset,receiptPayment(a),settlement.transaction as Hex,1);if(proof.state!=="paid")return reply(503,{code:"CACHED_PAYMENT_UNCONFIRMED"});}
        else{
          const checked=await e.facilitator.verify(payload as PaymentPayload,requirements);if(!checked.isValid)return reply(402,{code:checked.invalidReason??"PAYMENT_INVALID"});
          settlement=await e.facilitator.settle(payload as PaymentPayload,requirements);if(!settlement.success)return reply(503,{code:settlement.errorReason??"SETTLEMENT_UNKNOWN"});
        }
        const result=expectedStats(symbol as "ETH"|"BTC"),signedReceipt=row.receipt?JSON.parse(row.receipt):await signReceipt(e.merchantSigner,{version:1,network:requirements.network,resourceUrl:url.href,payer:e.agentA.address,issuedAt:Number((await e.pc.getBlock()).timestamp),transaction:settlement.transaction});
        db.prepare("UPDATE eoa_orders SET settlement=?,result=?,receipt=? WHERE key=?").run(canonicalJson(settlement),canonicalJson(result),canonicalJson(signedReceipt),key);
        const headers={"PAYMENT-RESPONSE":encodePaymentResponseHeader({...settlement,extensions:{"offer-receipt":{info:{receipt:signedReceipt}}}})};
        if(options.failAfterPayment&&!failed){failed=true;return reply(500,{code:"SERVICE_FAILED_AFTER_PAYMENT"},headers);}
        return reply(200,result,headers);
      }finally{store.release(lease);}
    }catch{return reply(503,{code:"EOA_MERCHANT_UNKNOWN"});}
  });
  await new Promise<void>((r,j)=>{server.once("error",j);server.listen(0,"127.0.0.1",r);});const address=server.address();if(!address||typeof address==="string")throw Error("EOA_MERCHANT_BIND_FAILED");origin=`http://127.0.0.1:${address.port}`;
  return {origin,requirements,requests:()=>requests,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();}};
}
