// Public discovery only. No credentials, payment signature, transaction or merchant request.
import {mkdirSync,writeFileSync} from "node:fs";
import {SafeHttp} from "../services/http.js";
import {BazaarClient,CatalogCache,filterService} from "../services/catalog.js";
const cache=new CatalogCache(".runtime/m4/catalog.sqlite");
mkdirSync("artifacts/m4",{recursive:true});
const client=new BazaarClient(new SafeHttp({allowOrigins:["https://api.cdp.coinbase.com"],maxBytes:2000000,timeoutMs:20000}),cache);
try {
  const pages=await client.browse(3),search=await client.search({query:"financial market data",network:"eip155:8453",limit:10});
  const candidates=pages.items.map(item=>({serviceId:filterService(item,{chainId:84532,asset:"0x036CbD53842c5426634e7929541eC2318f3dCF7e",maxPerPayment:100000n,approvedPayTo:[],approvedUrls:[],verifiedFacilitator:false}).serviceId,resource:item.resource,decision:filterService(item,{chainId:84532,asset:"0x036CbD53842c5426634e7929541eC2318f3dCF7e",maxPerPayment:100000n,approvedPayTo:[],approvedUrls:[],verifiedFacilitator:false})}));
  const result={schemaVersion:2,recordedAt:new Date().toISOString(),source:"https://docs.cdp.coinbase.com/x402/buyer/discover-services",transactionsSubmitted:0,paymentSignaturesSent:0,browse:pages,search,candidates,limitations:["Catalog metadata is untrusted and does not approve a resource, signer or facilitator.","All candidates require owner scope and live endpoint verification before purchase."]};
  writeFileSync("artifacts/m4/bazaar-probe.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({pages:pages.pages.length,items:pages.items.length,searchResults:search.items.length,transactions:0}));
}finally{cache.close();}
