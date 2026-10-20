import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {observeTarget,type ObservationTarget} from "../operations/observe.js";

const versions=JSON.parse(readFileSync("mandate/sdk/VERSIONS.json","utf8"));
const networks=JSON.parse(readFileSync("mandate/networks/networks.json","utf8")).networks;
const base=JSON.parse(readFileSync("artifacts/m5/lifecycle/trusted-config.json","utf8"));
const targets:ObservationTarget[]=versions.networks.map((n:any)=>{
  const deployment=JSON.parse(readFileSync(n.evidence,"utf8")),account=deployment.contracts.MandateAccount;
  const network=networks.find((x:any)=>x.chainId===n.chainId);
  const history=n.chainId===84532?base:JSON.parse(readFileSync("artifacts/m3/11155111-acceptance.json","utf8"));
  return {chainId:n.chainId,rpcs:[network.rpc,network.witnessRpc],wallet:account.address,owner:account.owner,asset:account.asset,runtimeHash:n.contracts.MandateAccount.runtimeHash,mandateId:history.mandateId,sessionId:history.sessionId};
});
// Bound free-provider load to one network at a time; failures remain evidence.
const results=[];
for(const target of targets){
  try{results.push(await observeTarget(target));}catch(error){results.push({chainId:target.chainId,wallet:target.wallet,verified:false,errorCode:error instanceof Error?error.message.split("\n")[0]:"OBSERVATION_FAILED",transactionsSubmitted:0});}
}
const report={schemaVersion:1,recordedAt:new Date().toISOString(),sourceCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),mode:"read-only-third-party-RPC",transactionsSubmitted:0,results,limitations:["Two-provider finalized-state comparison is not independent consensus verification.","Historical policies may be expired, revoked or unfunded; this is not a new purchase acceptance.","No mainnet queries, signing keys, wallet clients or transaction broadcast."]};
mkdirSync("artifacts/m6/public/runs",{recursive:true});
const output="artifacts/m6/public/observation.json";
if(existsSync(output)){const previous=JSON.parse(readFileSync(output,"utf8"));copyFileSync(output,"artifacts/m6/public/runs/"+previous.recordedAt.replaceAll(":","-")+".json");}
writeFileSync(output,JSON.stringify(report,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");
console.log(JSON.stringify({verified:results.filter(r=>r.verified).length,total:results.length,transactionsSubmitted:0}));
if(results.some(r=>!r.verified))process.exitCode=1;
