import {it,expect} from "vitest";
import {createServer} from "node:http";
import {encodePaymentRequiredHeader} from "@x402/core/http";
import {privateKeyToAccount} from "viem/accounts";
import {keccak256,toHex,type Hex,type Address} from "viem";
import {fetchQuote} from "../quote.js";
import {SafeHttp} from "../http.js";
import {requestHash,canonicalJson,merchantQuoteTypedData,decodePayment,encodePayment,nonceFor,type Payment} from "../../sdk/model.js";
it("latest quote binds resource, amount, domain and configured signer; discovery cannot approve payment",async()=>{
  const signer=privateKeyToAccount(("0x"+"1".padStart(64,"0")) as Hex),wallet="0x1111111111111111111111111111111111111111" as Address,asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
  let amount="10000",wrongResource=false,wrongSigner=false;let origin="";
  const requirements=()=>({scheme:"exact",network:"eip155:84532" as const,asset,amount,payTo:signer.address,maxTimeoutSeconds:300,extra:{name:"USDC",version:"2"}});
  const server=createServer(async(req,res)=>{
    const context=req.headers["mandate-context"];
    const extensions:Record<string,unknown>={};
    if(typeof context==="string"){
      const payment=decodePayment(JSON.parse(Buffer.from(context,"base64").toString("utf8")));
      const quoteSigner=wrongSigner?privateKeyToAccount(("0x"+"2".padStart(64,"0")) as Hex):signer;
      extensions.mandateQuote={schemaVersion:2,payment:encodePayment(payment),signature:await quoteSigner.signTypedData(merchantQuoteTypedData(84532,wallet,payment))};
    }
    res.writeHead(402,{"PAYMENT-REQUIRED":encodePaymentRequiredHeader({x402Version:2,resource:{url:origin+(wrongResource?"/other":"/stats")},accepts:[requirements()],extensions})});res.end("{}");
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const a=server.address();if(!a||typeof a==="string")throw new Error("BIND");origin=`http://127.0.0.1:${a.port}`;
  const http=new SafeHttp({testLoopbackOrigins:[origin],allowOrigins:[origin]}),request={method:"GET" as const,url:origin+"/stats",body:null};
  const policy={chainId:84532,asset,payTo:signer.address,domainName:"USDC",domainVersion:"2",maxAmount:100000n,approvedRequestHash:requestHash(request),quoteSigner:signer.address};
  const hash=keccak256(toHex("id")),step=keccak256(toHex("step"));
  const payment:Payment={mandateId:hash,policyVersion:1n,sessionId:hash,sessionEpoch:1n,stepId:step,merchantId:hash,requestHash:policy.approvedRequestHash,quoteHash:keccak256(toHex(canonicalJson(requirements()))),to:signer.address,value:10000n,validAfter:0n,validBefore:1200n,nonce:nonceFor(84532,wallet,hash,step)};
  try {
    const first=await fetchQuote(http,request,policy,{discoveryOnly:true});expect(first.readyForRegistration).toBe(false);
    await expect(fetchQuote(http,request,policy)).rejects.toThrow("MERCHANT_QUOTE_PROOF_REQUIRED");
    const quote=await fetchQuote(http,request,policy,{payment,wallet,chainTimestamp:1000n});expect(quote.readyForRegistration).toBe(true);expect(quote.evidenceLevel).toBe("internal-mandate-quote-signature");
    await expect(fetchQuote(http,request,policy,{payment,wallet,chainTimestamp:1200n})).rejects.toThrow("PAYMENT_QUOTE_OR_WINDOW_MISMATCH");
    wrongSigner=true;await expect(fetchQuote(http,request,policy,{payment,wallet,chainTimestamp:1000n})).rejects.toThrow("MERCHANT_QUOTE_SIGNER_MISMATCH");wrongSigner=false;
    wrongResource=true;await expect(fetchQuote(http,request,policy,{discoveryOnly:true})).rejects.toThrow("QUOTE_RESOURCE_MISMATCH");wrongResource=false;
    amount="20000";await expect(fetchQuote(http,request,policy,{previousRequirementsHash:quote.quoteHash,discoveryOnly:true})).rejects.toThrow("QUOTE_CHANGED_APPROVAL_REQUIRED");
    amount="100001";await expect(fetchQuote(http,request,policy,{discoveryOnly:true})).rejects.toThrow("QUOTE_OUTSIDE_AUTHORIZATION");
    await expect(fetchQuote(http,{...request,url:origin+"/other"},policy)).rejects.toThrow("OWNER_REQUEST_APPROVAL_REQUIRED");
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
