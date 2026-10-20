import {createServer} from "node:http";
import {mkdirSync,chmodSync} from "node:fs";
import {dirname} from "node:path";
import {z} from "zod";
import {encodePaymentRequiredHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader} from "@x402/core/http";
import type {PaymentRequirements,PaymentPayload,SettleResponse} from "@x402/core/types";
import type {controlledFacilitator} from "./facilitator.js";
import {hashTypedData,keccak256,toHex,isAddressEqual,TransactionReceiptNotFoundError,type Address,type Hex,type PublicClient,type LocalAccount} from "viem";
import {requestHash,canonicalJson,decodePayment,encodePayment,merchantQuoteTypedData,authorizationTypes,MandateError} from "../sdk/model.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {reconcilePayment} from "../sdk/reader.js";
import {PurchaseStore} from "./store.js";
import {expectedStats} from "./datasets.js";
import {signOffer,signReceipt} from "../evidence/signed-artifacts.js";
export {expectedStats,marketFixture} from "./datasets.js";
const PayloadSchema=z.object({x402Version:z.literal(2),resource:z.object({url:z.string()}).passthrough(),accepted:z.unknown(),payload:z.object({signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/),authorization:z.object({from:z.string().regex(/^0x[0-9a-fA-F]{40}$/),to:z.string().regex(/^0x[0-9a-fA-F]{40}$/),value:z.string().regex(/^[1-9][0-9]*$/),validAfter:z.literal("0"),validBefore:z.string().regex(/^[1-9][0-9]*$/),nonce:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict()}).strict(),extensions:z.record(z.unknown()).optional()}).strict();
export async function startControlledMerchant(options:{pc:PublicClient;facilitator:ReturnType<typeof controlledFacilitator>;chainId:number;asset:Address;payTo:Address;quoteSigner:LocalAccount;allowedWallets:Address[];dbPath:string;domainName?:string;domainVersion?:string;priceAtomic?:string;port?:number;confirmations?:number;failAfterPayment?:boolean;signedOffersAndReceipts?:boolean}) {
  mkdirSync(dirname(options.dbPath),{recursive:true,mode:0o700});
  const leases=new PurchaseStore(options.dbPath),db=leases.db;
  db.exec("CREATE TABLE IF NOT EXISTS merchant_orders(key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,payload_hash TEXT NOT NULL,payment TEXT NOT NULL,settlement TEXT,result TEXT)");chmodSync(options.dbPath,0o600);
  if(!(db.prepare("PRAGMA table_info(merchant_orders)").all() as {name:string}[]).some(c=>c.name==="signed_receipt"))db.exec("ALTER TABLE merchant_orders ADD COLUMN signed_receipt TEXT");
  let origin="",failed=false;
  const requirements:PaymentRequirements={scheme:"exact",network:`eip155:${options.chainId}`,asset:options.asset,amount:options.priceAtomic??"10000",payTo:options.payTo,maxTimeoutSeconds:300,extra:{name:options.domainName??"USDC",version:options.domainVersion??"2",assetTransferMethod:"eip3009"}};
  const quoteHash=keccak256(toHex(canonicalJson(requirements)));
  const server=createServer(async(req,res)=>{
    const reply=(status:number,data:unknown,headers:Record<string,string>={})=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store",...headers});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url??"/",origin);
      if(url.origin!==origin)return reply(400,{code:"ORIGIN_MISMATCH"});
      if(req.method!=="GET" || url.pathname!=="/stats" || !["ETH","BTC"].includes(url.searchParams.get("asset")??"") || [...url.searchParams.keys()].some(k=>k!=="asset"))return reply(404,{code:"RESOURCE_UNSUPPORTED"});
      if(req.headers.host!==new URL(origin).host)return reply(400,{code:"HOST_MISMATCH"});
      const httpHash=requestHash({method:"GET",url:url.href,body:null}),header=req.headers["payment-signature"],context=req.headers["mandate-context"];
      if(typeof header!=="string") {
        const extensions:Record<string,unknown>={};
        if(options.signedOffersAndReceipts)extensions["offer-receipt"]={info:{offers:[await signOffer(options.quoteSigner,{version:1,resourceUrl:url.href,scheme:"exact",network:requirements.network,asset:options.asset,payTo:options.payTo,amount:requirements.amount,validUntil:Number((await options.pc.getBlock()).timestamp)+300},0)]}};
        if(typeof context==="string") {
          if(context.length>12000)return reply(400,{code:"CONTEXT_TOO_LARGE"});
          const payment=decodePayment(JSON.parse(Buffer.from(context,"base64").toString("utf8")));
          const payer=req.headers["mandate-wallet"];
          if(typeof payer!=="string" || !options.allowedWallets.some(a=>a.toLowerCase()===payer.toLowerCase()))return reply(400,{code:"WALLET_UNSUPPORTED"});
          const step=await options.pc.readContract({address:payer as Address,abi:accountAbi,functionName:"getStep",args:[payment.mandateId,payment.policyVersion,payment.stepId]});
          if(step.requestHash!==httpHash || payment.requestHash!==httpHash || payment.quoteHash!==quoteHash || !isAddressEqual(payment.to,options.payTo) || payment.value!==BigInt(requirements.amount))return reply(400,{code:"QUOTE_REQUEST_CONTEXT_MISMATCH"});
          extensions.mandateQuote={schemaVersion:2,payment:encodePayment(payment),signature:await options.quoteSigner.signTypedData(merchantQuoteTypedData(options.chainId,payer as Address,payment))};
        }
        return reply(402,{code:"PAYMENT_REQUIRED"},{"PAYMENT-REQUIRED":encodePaymentRequiredHeader({x402Version:2,resource:{url:url.href,description:"Fixed public dataset; controlled Mandate-aware merchant",mimeType:"application/json"},accepts:[requirements],extensions})});
      }
      if(header.length>16000)return reply(400,{code:"PAYLOAD_TOO_LARGE"});
      const decoded=PayloadSchema.parse(decodePaymentSignatureHeader(header)),payload=decoded as PaymentPayload;
      if(new URL(decoded.resource.url).href!==url.href || canonicalJson(decoded.accepted)!==canonicalJson(requirements))return reply(400,{code:"RESOURCE_OR_REQUIREMENTS_MISMATCH"});
      const authorization=decoded.payload.authorization,payer=authorization.from as Address;
      if(!options.allowedWallets.some(a=>isAddressEqual(a,payer)))return reply(400,{code:"WALLET_UNSUPPORTED"});
      const digest=hashTypedData({domain:{name:requirements.extra.name as string,version:requirements.extra.version as string,chainId:options.chainId,verifyingContract:options.asset},types:authorizationTypes,primaryType:"TransferWithAuthorization",message:{from:payer,to:authorization.to as Address,value:BigInt(authorization.value),validAfter:0n,validBefore:BigInt(authorization.validBefore),nonce:authorization.nonce as Hex}});
      const commitment=await options.pc.readContract({address:payer,abi:accountAbi,functionName:"getCommitment",args:[digest]});
      if(!commitment.exists || commitment.payment.requestHash!==httpHash || commitment.payment.quoteHash!==quoteHash || commitment.payment.nonce!==authorization.nonce || commitment.payment.value!==BigInt(requirements.amount))return reply(400,{code:"PAYMENT_HTTP_BINDING_MISMATCH"});
      const key=`${options.chainId}:${options.asset.toLowerCase()}:${payer.toLowerCase()}:${authorization.nonce.toLowerCase()}`,payloadHash=keccak256(toHex(canonicalJson(payload)));
      const lease=leases.claim(key,120000);if(!lease)return reply(503,{code:"ORDER_IN_PROGRESS"});
      try {
        db.prepare("INSERT OR IGNORE INTO merchant_orders(key,request_hash,payload_hash,payment) VALUES(?,?,?,?)").run(key,httpHash,payloadHash,canonicalJson(encodePayment(decodePayment(Object.fromEntries(Object.entries(commitment.payment).map(([k,v])=>[k,typeof v==="bigint"?v.toString():v]))))));
        const order=db.prepare("SELECT * FROM merchant_orders WHERE key=?").get(key) as {request_hash:string;payload_hash:string;payment:string;settlement?:string;result?:string;signed_receipt?:string};
        if(order.request_hash!==httpHash || order.payload_hash!==payloadHash)return reply(409,{code:"ORDER_REUSE_MISMATCH"});
        let settlement: SettleResponse|undefined=order.settlement?JSON.parse(order.settlement):undefined;
        if(settlement) {
          let paid=false;
          try {
            const proof=await reconcilePayment(options.pc,payer,options.asset,decodePayment(JSON.parse(order.payment)),settlement.transaction as Hex,options.confirmations??2);
            paid=proof.state==="paid";
            if(!paid && proof.nonceUsed)return reply(503,{code:"CACHED_PAYMENT_UNCONFIRMED"});
          }catch(error){if(!(error instanceof TransactionReceiptNotFoundError))throw error;}
          if(!paid) {
            leases.renew(lease);
            settlement=await options.facilitator.reconcileOriginalSettlement(payload,requirements);
            if(!settlement.success)return reply(503,{code:settlement.errorReason??"ORIGINAL_SETTLEMENT_UNKNOWN"});
            const proof=await reconcilePayment(options.pc,payer,options.asset,decodePayment(JSON.parse(order.payment)),settlement.transaction as Hex,options.confirmations??2);
            if(proof.state!=="paid")return reply(503,{code:"CACHED_PAYMENT_UNCONFIRMED"});
          }
        }else {
          const verify=await options.facilitator.verify(payload,requirements);if(!verify.isValid)return reply(402,{code:verify.invalidReason??"PAYMENT_INVALID"});
          leases.renew(lease);
          settlement=await options.facilitator.settle(payload,requirements);
          if(!settlement.success)return reply(503,{code:settlement.errorReason??"SETTLEMENT_UNKNOWN"},{"PAYMENT-RESPONSE":encodePaymentResponseHeader(settlement)});
        }
        const result=expectedStats(url.searchParams.get("asset") as "ETH"|"BTC");
        db.prepare("UPDATE merchant_orders SET settlement=?,result=? WHERE key=?").run(canonicalJson(settlement),canonicalJson(result),key);
        if(options.failAfterPayment && !failed){failed=true;return reply(500,{code:"SERVICE_FAILED_AFTER_PAYMENT"},{"PAYMENT-RESPONSE":encodePaymentResponseHeader(settlement)});}
        if(options.signedOffersAndReceipts){
          const receipt=order.signed_receipt?JSON.parse(order.signed_receipt):await signReceipt(options.quoteSigner,{version:1,network:requirements.network,resourceUrl:url.href,payer,issuedAt:Number((await options.pc.getBlock()).timestamp),transaction:settlement.transaction});
          if(!order.signed_receipt)db.prepare("UPDATE merchant_orders SET signed_receipt=? WHERE key=?").run(canonicalJson(receipt),key);
          return reply(200,result,{"PAYMENT-RESPONSE":encodePaymentResponseHeader({...settlement,extensions:{"offer-receipt":{info:{receipt}}}})});
        }
        return reply(200,result,{"PAYMENT-RESPONSE":encodePaymentResponseHeader(settlement)});
      }finally{leases.release(lease);}
    }catch(error){return reply(503,{code:error instanceof MandateError?error.code:"MERCHANT_REQUEST_UNKNOWN"});}
  });
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(options.port??0,"127.0.0.1",resolve);});
  const address=server.address();if(!address || typeof address==="string")throw new Error("MERCHANT_BIND_FAILED");origin=`http://127.0.0.1:${address.port}`;
  return {origin,requirements,quoteHash,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));leases.close();}};
}
