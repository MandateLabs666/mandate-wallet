import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import type { x402Facilitator } from '@x402/core/facilitator';
import type { PaymentRequirements, Network } from '@x402/core/types';
import { canonical } from './model.js';

export const fixture={ ETH:[100,110,120], BTC:[200,220,240] } as const;
export function expectedResult(asset:'ETH'|'BTC') { const values=fixture[asset]; return { datasetId:'mandate-public-fixture-v1',asset,count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length }; }

export async function startMerchant(options:{ facilitator:x402Facilitator; chainId:number; asset:string; payTo:string; dbPath:string; failAfterPayment?:boolean; port?:number; domainName?:string }) {
  const adapter:FacilitatorClient={ verify:(p,r)=>options.facilitator.verify(p,r),settle:(p,r)=>options.facilitator.settle(p,r),getSupported:async()=>{
    const supported=options.facilitator.getSupported();return {...supported,kinds:supported.kinds.map(k=>({...k,network:k.network as Network}))};
  } };
  const resourceServer=new x402ResourceServer(adapter).register(`eip155:${options.chainId}` as Network,new ExactEvmScheme());
  await resourceServer.initialize();
  const db=new DatabaseSync(options.dbPath); db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS orders(key TEXT PRIMARY KEY, request TEXT NOT NULL, payload TEXT NOT NULL, settlement TEXT NOT NULL, result TEXT NOT NULL)');
  let failed=false;
  const server=createServer(async(req,res)=>{
    const reply=(code:number,body:unknown,headers:Record<string,string>={})=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(body));};
    try {
      const url=new URL(req.url ?? '/',origin);
      if(req.method!=='GET'||url.pathname!=='/stats'||!['ETH','BTC'].includes(url.searchParams.get('asset') ?? '')||[...url.searchParams.keys()].some(k=>k!=='asset')) return reply(404,{code:'RESOURCE_UNSUPPORTED'});
      const asset=url.searchParams.get('asset') as 'ETH'|'BTC';
      const requirements:PaymentRequirements={scheme:'exact',network:`eip155:${options.chainId}`,asset:options.asset,amount:'100000',payTo:options.payTo,maxTimeoutSeconds:300,extra:{name:options.domainName ?? 'USDC',version:'2'}};
      const resource={url:url.href,description:'Fixed public dataset statistics; not live market data',mimeType:'application/json'};
      const header=req.headers['payment-signature'];
      if(typeof header!=='string') {
        const required=await resourceServer.createPaymentRequiredResponse([requirements],resource);
        return reply(402,{code:'PAYMENT_REQUIRED'},{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(required)});
      }
      const payload=decodePaymentSignatureHeader(header);
      if(payload.resource?.url!==url.href) return reply(400,{code:'RESOURCE_MISMATCH'});
      const accepted=resourceServer.findMatchingRequirements([requirements],payload);
      if(!accepted) return reply(400,{code:'PAYMENT_REQUIREMENTS_MISMATCH'});
      const auth=payload.payload.authorization as {from?:string;nonce?:string}|undefined;
      if(!auth?.from||!auth.nonce) return reply(400,{code:'INVALID_AUTHORIZATION'});
      const key=`${requirements.network}:${requirements.asset.toLowerCase()}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
      const cached=db.prepare('SELECT * FROM orders WHERE key=?').get(key) as {request:string;payload:string;settlement:string;result:string}|undefined;
      if(cached) {
        if(cached.request!==url.href||cached.payload!==canonical(payload)) return reply(409,{code:'ORDER_REUSE_MISMATCH'});
        return reply(200,JSON.parse(cached.result),{'PAYMENT-RESPONSE':encodePaymentResponseHeader(JSON.parse(cached.settlement))});
      }
      const verify=await resourceServer.verifyPayment(payload,accepted);
      if(!verify.isValid) return reply(402,{code:verify.invalidReason ?? 'INVALID_PAYMENT'});
      const settled=await resourceServer.settlePayment(payload,accepted);
      if(!settled.success) return reply(503,{code:settled.errorReason ?? 'SETTLEMENT_UNKNOWN'},{'PAYMENT-RESPONSE':encodePaymentResponseHeader({...settled,errorMessage:undefined})});
      const result=expectedResult(asset);
      db.prepare('INSERT OR IGNORE INTO orders VALUES (?,?,?,?,?)').run(key,url.href,canonical(payload),canonical(settled),canonical(result));
      if(options.failAfterPayment&&!failed) { failed=true; return reply(500,{code:'SERVICE_FAILED_AFTER_PAYMENT'},{'PAYMENT-RESPONSE':encodePaymentResponseHeader(settled)}); }
      reply(200,result,{'PAYMENT-RESPONSE':encodePaymentResponseHeader(settled)});
    } catch(error) { if(options.chainId===31337&&process.env.M1_DEBUG_LOCAL==='1')console.error(error);reply(503,{code:'MERCHANT_UNAVAILABLE'}); }
  });
  let origin='';
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port ?? 0,'127.0.0.1',resolve);});
  const addr=server.address(); if(!addr||typeof addr==='string') throw new Error('MERCHANT_BIND_FAILED');
  origin=`http://127.0.0.1:${addr.port}`;
  return {origin,resourceServer,close:async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));db.close();}};
}
