// Local-only backing services for acceptance with a real external browser wallet.
// Initial deployments use the public Anvil fixture; owner actions after startup
// must come from the browser wallet. No owner signing endpoint is exposed.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {spawn} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {createInterface} from "node:readline";
import {keccak256,toHex} from "viem";
import {localEnvironment} from "../examples/local-environment.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";

process.umask(0o077);
const output=resolve(process.env.MANDATE_WALLET_FIXTURE_DIR??".runtime/browser-wallet");
mkdirSync(output,{recursive:true,mode:0o700});
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?String(v):v,2)+"\n";
const save=(path:string,value:unknown)=>writeFileSync(path,json(value),{mode:0o600});
const e=await localEnvironment({standaloneMerchant:true,failAfterPayment:true,signedOffersAndReceipts:true});
let child:ReturnType<typeof spawn>|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
try{
  const connectionToken=randomBytes(32).toString("hex"),config=join(e.directory,"wallet-gateway.json"),credentialFile=join(e.directory,"wallet-credential.json"),verification=join(e.directory,"wallet-verification.json");
  save(credentialFile,{connectionToken});
  for(const [name,account]of [["session",e.agentA],["operator",e.operator]] as const)save(join(e.directory,name+".json"),{privateKey:toHex(account.getHdKey().privateKey!)});
  save(config,{schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:String(e.context(0).startBlock),sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"purchases.sqlite",credentialSHA256:createHash("sha256").update(connectionToken).digest("hex"),evmFeeReservationCapWei:"1000000000000000",confirmations:1,services:e.services.map((s,i)=>({serviceId:s.serviceId,stepId:s.stepId,method:s.method,url:s.url,body:null,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin],evidenceStoreFile:"wallet.evidence.sqlite"});
  save(verification,{schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:true,result:true}});
  child=spawn(process.execPath,["--import","tsx","mandate/web/cli.ts","--config",config,"--credential-file",credentialFile,"--verification-file",verification],{env:{PATH:process.env.PATH??"",MANDATE_WEB_PORT:"0"},stdio:["ignore","pipe","pipe"]});
  const origin=await new Promise<string>((yes,no)=>{
    let out="",diagnostic="";const timer=setTimeout(()=>no(Error("WALLET_WEB_START_TIMEOUT")),15000);
    child!.stderr!.on("data",d=>{diagnostic+=d.toString();});
    child!.stdout!.on("data",d=>{out+=d.toString();for(const line of out.split("\n")){try{const v=JSON.parse(line);if(v.origin&&v.ownerKeyLoaded===false){clearTimeout(timer);yes(v.origin);}}catch{}}});
    child!.once("exit",()=>{clearTimeout(timer);writeFileSync(join(output,"web-private-error.txt"),diagnostic,{mode:0o600});no(Error("WALLET_WEB_EXITED"));});
  });
  save(join(output,"fixture.json"),{origin,connectionToken,rpc:e.node.rpc,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,services:e.services.map(s=>({serviceId:s.serviceId,stepId:s.stepId,url:s.url})),root:e.root,configFile:config,credentialFile,verificationFile:verification});
  // Publish paths, not credential values, so an operator can connect an MCP host
  // to the same local task/store instead of preparing an unrelated second demo.
  console.log(JSON.stringify({ready:true,mode:"local-EVM-real-browser-wallet",ownerKeyInWeb:false,newPublicTransactions:0,origin,configFile:config,credentialFile,verificationFile:verification}));
  for await(const line of input){
    if(line.trim()==="stop")break;
    if(line.trim()==="inspect"){
      const logs=await e.pc.getLogs({address:e.asset,event:testTokenAbi.find(a=>a.type==="event"&&a.name==="AuthorizationUsed") as any,fromBlock:0n,toBlock:"latest"});
      const walletCash=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]});
      const ownerNonce=await e.pc.getTransactionCount({address:e.owner.address,blockTag:"latest"});
      console.log(JSON.stringify({chainId:31337,wallet:e.wallet,walletCash:String(walletCash),paymentCount:logs.filter((l:any)=>l.args.authorizer.toLowerCase()===e.wallet.toLowerCase()).length,ownerNonce,newPublicTransactions:0}));
    }
  }
}finally{
  input.close();if(child&&child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(yes=>child!.once("exit",yes)),new Promise(yes=>setTimeout(yes,3000))]);if(child.exitCode===null)child.kill("SIGKILL");}
  await e.close();
}
