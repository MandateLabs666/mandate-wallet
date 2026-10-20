import {readFileSync,statSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {createPublicClient,createWalletClient,http,type Address,type Hex,type Chain} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {baseSepolia,sepolia,foundry} from "viem/chains";
import {accountAbi} from "../sdk/accountAbi.js";
import {MandateReader} from "../sdk/reader.js";
import {MandateError,atomicAmount,canonicalJson} from "../sdk/model.js";
import {PurchaseClient,type ApprovedService} from "../services/client.js";
import {PurchaseStore} from "../services/store.js";
import {DurableTransactions} from "../services/transactions.js";
import {SafeHttp} from "../services/http.js";
import {BazaarClient,CatalogCache} from "../services/catalog.js";
import {expectedStats} from "../services/datasets.js";
import {GatewayTools} from "./tools.js";
import {EvidenceJournal} from "../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../evidence/recorder.js";
import {ControllerClient} from "../evidence/controller-http.js";
import {verifyEnvelope} from "../evidence/controller-model.js";

const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(x=>x as Address);
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(x=>x as Hex);
const endpoint=z.string().url().refine(value=>{const u=new URL(value);return !u.username&&!u.password&&!u.hash&&(u.protocol==="https:"||(u.protocol==="http:"&&["127.0.0.1","[::1]"].includes(u.hostname)));});
export const GatewayConfigSchema=z.object({
  schemaVersion:z.literal(2),chainId:z.union([z.literal(84532),z.literal(11155111),z.literal(31337)]),rpc:endpoint,
  wallet:address,asset:address,tokenName:z.string().min(1).max(100),tokenVersion:z.string().min(1).max(20),
  agentId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),mandateId:hash,sessionId:hash,startBlock:z.string().regex(/^(0|[1-9][0-9]*)$/),
  sessionKeyFile:z.string().min(1),operatorKeyFile:z.string().min(1),storeFile:z.string().min(1),
  credentialSHA256:z.string().regex(/^[0-9a-f]{64}$/),
  evmFeeReservationCapWei:z.string().regex(/^[1-9][0-9]*$/).default("1000000000000000"),confirmations:z.number().int().min(1).max(64).default(2),
  services:z.array(z.object({serviceId:hash,stepId:hash,method:z.enum(["GET","POST"]),url:endpoint,body:z.unknown(),resultChecker:z.enum(["ETH-stats-v2","BTC-stats-v2"])}).strict()).min(1).max(64),
  testLoopbackOrigins:z.array(endpoint).max(8).default([]),httpTimeoutMs:z.number().int().min(1000).max(120000).default(60000),catalogCacheFile:z.string().optional(),
  evidenceStoreFile:z.string().optional(),
  controller:z.object({url:endpoint,signer:address,envelopeFile:z.string().min(1),requestJournalFile:z.string().min(1)}).strict().optional(),
}).strict();
export type GatewayConfig=z.infer<typeof GatewayConfigSchema>;
export function authenticateCredential(expected:string,credential:string|undefined) {
  if(!credential || credential.length<32 || credential.length>1024)throw new MandateError("TOOL_CONNECTION_UNAUTHENTICATED");
  const actual=createHash("sha256").update(credential).digest(),wanted=Buffer.from(expected,"hex");
  if(wanted.length!==actual.length || !timingSafeEqual(actual,wanted))throw new MandateError("TOOL_CONNECTION_UNAUTHENTICATED");
}
export async function loadGateway(configPath:string,credential:string|undefined) {
  const originalProfile=readFileSync(configPath,"utf8"),profileDigest=createHash("sha256").update(originalProfile).digest("hex");
  const config=GatewayConfigSchema.parse(JSON.parse(originalProfile));
  authenticateCredential(config.credentialSHA256,credential);
  // Rotation takes effect in a running process. A new profile must be explicitly
  // reloaded, never silently change the account or signer of this connection.
  const authorizeConnection=()=>{
    let current:string,parsed:GatewayConfig;
    try{current=readFileSync(configPath,"utf8");parsed=GatewayConfigSchema.parse(JSON.parse(current));}
    catch{throw new MandateError("TOOL_CONNECTION_PROFILE_UNAVAILABLE");}
    if(parsed.credentialSHA256!==config.credentialSHA256)throw new MandateError("TOOL_CONNECTION_UNAUTHENTICATED");
    if(createHash("sha256").update(current).digest("hex")!==profileDigest)throw new MandateError("TOOL_CONNECTION_PROFILE_CHANGED");
  };
  const directory=dirname(resolve(configPath)),file=(p:string)=>resolve(directory,p);
  const key=(p:string)=>{
    const path=file(p),stat=statSync(path);
    if(!stat.isFile()||(stat.mode&0o077)!==0)throw new MandateError("SIGNER_FILE_PERMISSIONS");
    const data=z.object({privateKey:z.string().regex(/^0x[0-9a-fA-F]{64}$/)}).strict().parse(JSON.parse(readFileSync(path,"utf8")));
    return privateKeyToAccount(data.privateKey as Hex);
  };
  const signer=key(config.sessionKeyFile),operator=key(config.operatorKeyFile),chain:Chain=config.chainId===84532?baseSepolia:config.chainId===11155111?sepolia:foundry;
  const pc=createPublicClient({chain,transport:http(config.rpc,{timeout:20000,retryCount:0}),pollingInterval:1000});
  const reader=new MandateReader(pc,config.chainId,config.wallet,{name:config.tokenName,version:config.tokenVersion,chainId:config.chainId,verifyingContract:config.asset});
  const [budget,owner]=await Promise.all([reader.readBudget(config.mandateId,config.sessionId),pc.readContract({address:config.wallet,abi:accountAbi,functionName:"owner"})]);
  if(!budget.session.exists || budget.session.signer.toLowerCase()!==signer.address.toLowerCase())throw new MandateError("CONFIGURED_AGENT_SIGNER_MISMATCH");
  if([signer.address,operator.address].some(a=>a.toLowerCase()===owner.toLowerCase())||signer.address.toLowerCase()===operator.address.toLowerCase())throw new MandateError("OWNER_OR_SIGNER_ROLE_COLLISION");
  if(BigInt(config.startBlock)>await pc.getBlockNumber({cacheTime:0}))throw new MandateError("INVALID_HISTORY_START");
  if(new Set(config.services.map(s=>s.serviceId)).size!==config.services.length||new Set(config.services.map(s=>s.stepId)).size!==config.services.length)throw new MandateError("DUPLICATE_SERVICE_CONFIGURATION");
  const services:ApprovedService[]=config.services.map(s=>({...s,body:s.body??null,checkResult:result=>canonicalJson(result)===canonicalJson(expectedStats(s.resultChecker==="ETH-stats-v2"?"ETH":"BTC"))}));
  const safe=new SafeHttp({allowOrigins:[...new Set(services.map(s=>new URL(s.url).origin))],testLoopbackOrigins:config.testLoopbackOrigins,timeoutMs:config.httpTimeoutMs});
  const store=new PurchaseStore(file(config.storeFile));let cache:CatalogCache|undefined,journal:EvidenceJournal|undefined;
  try {
    const transactions=new DurableTransactions(pc,createWalletClient({chain,account:operator,transport:http(config.rpc,{timeout:20000,retryCount:0})}),store,atomicAmount(config.evmFeeReservationCapWei),config.confirmations);
    const context={agentId:config.agentId,mandateId:config.mandateId,sessionId:config.sessionId,signer,services,startBlock:BigInt(config.startBlock)};
    journal=new EvidenceJournal(file(config.evidenceStoreFile??config.storeFile+".evidence.sqlite"));
    let controller:ControllerClient|undefined;
    if(config.controller){
      const scope={chainId:reader.chainId,wallet:reader.wallet,mandateId:config.mandateId,sessionId:config.sessionId,policyVersion:String(budget.policy.version),sessionEpoch:String(budget.session.epoch),signer:signer.address};
      const envelope=await verifyEnvelope(JSON.parse(readFileSync(file(config.controller.envelopeFile),"utf8")),owner,scope);
      if(envelope.payload.mode!=="live"||services.some(s=>!envelope.payload.stepIds.includes(s.stepId)))throw new MandateError("CONTROLLER_SCOPE_OR_MODE_INVALID");
      controller=new ControllerClient(config.controller.url,envelope,signer,config.controller.signer,new SafeHttp({allowOrigins:[new URL(config.controller.url).origin],testLoopbackOrigins:config.testLoopbackOrigins,timeoutMs:config.httpTimeoutMs}),file(config.controller.requestJournalFile));
    }
    const purchase=new PurchaseClient(context,reader,transactions,safe,store,new PurchaseEvidenceRecorder(journal,reader,context,controller));
    cache=config.catalogCacheFile?new CatalogCache(file(config.catalogCacheFile)):undefined;
    return {config,purchase,authorizeConnection,tools:new GatewayTools(purchase,cache?new BazaarClient(new SafeHttp(),cache):undefined,authorizeConnection),close:()=>{cache?.close();journal?.close();store.close();}};
  }catch(error){cache?.close();journal?.close();store.close();throw error;}
}
