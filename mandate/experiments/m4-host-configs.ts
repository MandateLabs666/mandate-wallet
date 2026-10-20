import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {randomBytes,createHash} from "node:crypto";
import {GatewayConfigSchema} from "../gateway/runtime.js";
process.umask(0o077);
const directory=".runtime/m4",base=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8")),plan=JSON.parse(readFileSync(directory+"/public-plan.json","utf8")),report=JSON.parse(readFileSync("artifacts/m4/base-sepolia-http.json","utf8"));
if(!report.publicGatePassed)throw new Error("PUBLIC_HTTP_ACCEPTANCE_REQUIRED");
mkdirSync(directory+"/credentials",{recursive:true,mode:0o700});
for(let i=0;i<2;i++) {
  const agentId=i===0?"agent-a":"agent-b",credentialFile=directory+"/credentials/"+agentId+".json";
  if(!existsSync(credentialFile))writeFileSync(credentialFile,JSON.stringify({connectionToken:randomBytes(32).toString("hex")}),{mode:0o600});
  const {connectionToken}=JSON.parse(readFileSync(credentialFile,"utf8"));
  const config=GatewayConfigSchema.parse({schemaVersion:2,chainId:84532,rpc:base.rpc,wallet:base.wallet,asset:base.asset,tokenName:base.tokenDomain.name,tokenVersion:base.tokenDomain.version,agentId,mandateId:plan.root,sessionId:plan.sessions[i],startBlock:String(report.ownerTransactions.find((r:{id:string})=>r.id==="create-root").receipt.blockNumber),sessionKeyFile:"../m3/keys/"+agentId+".json",operatorKeyFile:"../keys/operator.json",storeFile:"purchases.sqlite",credentialSHA256:createHash("sha256").update(connectionToken).digest("hex"),evmFeeReservationCapWei:"100000000000000",confirmations:2,services:[plan.services[i+2]],testLoopbackOrigins:[report.plan.merchantOrigin],httpTimeoutMs:90000,catalogCacheFile:"catalog.sqlite"});
  const path=directory+"/"+agentId+".json";writeFileSync(path,JSON.stringify(config,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({agentId,configFile:path,credentialFile,wallet:base.wallet,serviceId:config.services[0].serviceId}));
}
