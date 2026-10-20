import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {randomBytes,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {keccak256,toHex} from "viem";
import {localEnvironment} from "./local-environment.js";
import {EvidenceJournal,PurchaseEvidenceRecorder,PurchaseClient,GatewayTools,MandateWorkspace,independentlyVerify} from "../sdk/index.js";
import {OwnerStatus} from "../gateway/owner-status.js";
process.umask(0o077);const output=resolve(process.argv[2]??"artifacts/sdk-demo");mkdirSync(output,{recursive:true});
const e=await localEnvironment({standaloneMerchant:true,failAfterPayment:true}),journal=new EvidenceJournal(join(e.directory,"client.evidence.sqlite"));
const save=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n",{mode:0o600});
async function run(binary:string,args:string[]){return new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,["--import","tsx",binary,...args],{env:{PATH:process.env.PATH??""},stdio:["ignore","pipe","pipe"]});let logs="";child.stdout.on("data",d=>{logs+=d.toString();});child.stderr.on("data",d=>{logs+=d.toString();});const timer=setTimeout(()=>{child.kill("SIGTERM");reject(new Error("EXAMPLE_COMMAND_TIMEOUT"));},60000);child.once("error",()=>{clearTimeout(timer);reject(new Error("EXAMPLE_COMMAND_FAILED"));});child.once("exit",code=>{clearTimeout(timer);if(code===0)resolve();else{writeFileSync(join(e.directory,"example-error.txt"),logs,{mode:0o600});reject(new Error("EXAMPLE_EXIT_"+code+":"+binary+"; private diagnostic: "+join(e.directory,"example-error.txt")));}});});}
try{
  const token=randomBytes(32).toString("hex"),credential=join(e.directory,"connection.json"),config=join(e.directory,"gateway.json"),profile=join(e.directory,"verification.json");
  save(credential,{connectionToken:token});
  for(const [name,account] of [["session",e.agentA],["operator",e.operator]] as const)save(join(e.directory,name+".json"),{privateKey:toHex(account.getHdKey().privateKey!)});
  save(config,{schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"agent-a",mandateId:e.root,sessionId:e.sessions[0],startBlock:String(e.context(0).startBlock),sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"purchases.sqlite",credentialSHA256:createHash("sha256").update(token).digest("hex"),evmFeeReservationCapWei:"1000000000000000",confirmations:1,services:e.services.map((s,i)=>({serviceId:s.serviceId,stepId:s.stepId,method:s.method,url:s.url,body:null,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin],evidenceStoreFile:"client.evidence.sqlite"});
  const verification={schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:true,result:true}};save(profile,verification);
  // Run the documented minimal agent as a distinct process, with no owner file.
  await run("mandate/examples/minimal-agent.ts",[config,credential,profile,e.root,e.services[0].serviceId,join(output,"first-agent.json")]);
  const first=JSON.parse(readFileSync(join(output,"first-agent.json"),"utf8"));if(first.purchase.paymentState!=="paid"||first.purchase.serviceState!=="failed")throw new Error("EXPECTED_PAID_SERVICE_FAILURE_MISSING");
  await run("mandate/sdk/cli.ts",["call","--config",config,"--credential-file",credential,"--verification-file",profile,"--service",e.services[0].serviceId,"--output",join(output,"recovered.json")]);
  const recovered=JSON.parse(readFileSync(join(output,"recovered.json"),"utf8"));if(recovered.settlementHash!==first.purchase.settlementHash||recovered.resultState!=="valid")throw new Error("RECOVERY_DID_NOT_REUSE_PAYMENT");
  await run("mandate/sdk/cli.ts",["evidence","--config",config,"--credential-file",credential,"--verification-file",profile,"--service",e.services[0].serviceId,"--disclose-request","true","--disclose-result","true","--output",join(output,"evidence-bundle.json")]);
  const purchase=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(journal,e.reader,e.context(0))),workspace=await MandateWorkspace.create(new GatewayTools(purchase),verification),trust=await workspace.evidenceTrust(e.root,e.services[0].serviceId);save(join(output,"trusted-config.json"),trust);
  const checked=await independentlyVerify(JSON.parse(readFileSync(join(output,"evidence-bundle.json"),"utf8")),trust);save(join(output,"verification.json"),checked);if(!checked.report.requiredChecksPassed)throw new Error("INDEPENDENT_VERIFICATION_FAILED");
  await run("mandate/sdk/cli.ts",["owner-action","--config",config,"--credential-file",credential,"--input",(()=>{const path=join(e.directory,"revoke-input.json");save(path,{action:"revokeSession",taskId:e.root});return path;})(),"--output",join(output,"revoke-request.json")]);
  const request=JSON.parse(readFileSync(join(output,"revoke-request.json"),"utf8"));const receipt=await e.send(e.wallet,request.request.draft.transaction.data);const status=await workspace.noteOwnerBroadcast(request.request.requestId,receipt.transactionHash);if(status.grantStatus!=="revoked")throw new Error("OWNER_REVOCATION_FAILED");
  await run("mandate/sdk/cli.ts",["call","--config",config,"--credential-file",credential,"--service",e.services[1].serviceId,"--output",join(output,"after-revoke.json")]);
  const denied=JSON.parse(readFileSync(join(output,"after-revoke.json"),"utf8"));if(denied.paymentState!=="rejected")throw new Error("REVOKED_PURCHASE_NOT_REJECTED");
  save(join(output,"summary.json"),{mode:"local-EVM-test",merchantSeparateProcess:true,agentSeparateProcess:true,cliSeparateProcess:true,ownerHeldByTrustedLocalFixture:true,ownerKeyInAgentOrCLI:false,paidAtomic:"10000",sameHashOnRecovery:true,independentChecksPassed:true,overall:checked.report.overall,revocationConfirmed:true,laterStepRejected:true,newPublicTransactions:0});
  console.log(JSON.stringify({output,paidAtomic:"10000",sameHash:true,verified:true,revocationConfirmed:true}));
}finally{journal.close();await e.close();}
