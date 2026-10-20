import {existsSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,toHex,isAddressEqual,type Address,type Hex} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {z} from "zod";
import {localEnvironment} from "../examples/local-environment.js";
import {loadGateway,authenticateCredential,GatewayConfigSchema,type GatewayConfig} from "../gateway/runtime.js";
import {MandateWorkspace} from "../sdk/workspace.js";
import {factoryAbi} from "../sdk/factoryAbi.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {requestHash} from "../sdk/model.js";
import {PurchaseStore} from "../services/store.js";
import {DurableTransactions} from "../services/transactions.js";
import {controlledFacilitator} from "../services/facilitator.js";
import {startControlledMerchant} from "../services/merchant.js";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {atomicPrivate,privateDirectory,readJSON,stringify,digest} from "./files.js";
import {HostIntegration} from "./hosts.js";
import {domainSeparator} from "../experiments/runtime-match.js";

const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(x=>x as Address);
export type PublicNetwork={chainId:number;name:string;rpc:string;asset:Address;factory:Address;factoryHash:Hex};
export type IntentKind="account"|"fund-usdc"|"fund-gas"|"mandate"|"session";
type Intent={id:string;kind:IntentKind;state:"prepared"|"awaiting-wallet"|"broadcast"|"submission-unknown"|"rejected"|"confirmed"|"failed";from:Address;to:Address;data:Hex;value:string;chainId:number;hash?:Hex;block?:string;error?:string;summary?:{asset:Address;budgetAtomic:string;maxPaymentAtomic:string;expiresAt?:number;recipient?:Address;resources:string[]}};
type SetupState={schemaVersion:1;id:string;kind:"local"|"public"|"import";createdAt:string;chainId:number;owner:Address;wallet?:Address;asset:Address;salt?:Hex;mandateId:Hex;sessionId:Hex;startBlock:string;expiresAt?:number;merchantPort?:number;services?:GatewayConfig["services"];intents:Intent[];profilePath?:string;credentialPath?:string;descriptorPath?:string;};
export class SetupEngine {
  state?:SetupState;workspace?:MandateWorkspace;
  private runtime?:Awaited<ReturnType<typeof loadGateway>>;
  private local?:Awaited<ReturnType<typeof localEnvironment>>;
  private merchant?:Awaited<ReturnType<typeof startControlledMerchant>>;
  private facilityStore?:PurchaseStore;
  private busy=false;
  private clock?:ReturnType<typeof setInterval>;
  private lastCheck?:unknown;
  private host?:HostIntegration;
  private hostDescriptor?:string;
  readonly directory:string;
  readonly environment:{node:string;nodeSupported:boolean;anvilAvailable:boolean;desktopBundleAvailable:boolean};
  constructor(readonly options:{directory:string;project:string;home:string;entry:string;packageDirectory:string;networks:PublicNetwork[]}){
    this.directory=resolve(options.directory);privateDirectory(this.directory);
    const [major,minor]=process.versions.node.split('.').map(Number);
    this.environment={node:process.versions.node,nodeSupported:major===24&&minor>=2,anvilAvailable:spawnSync('anvil',['--version'],{timeout:2000,stdio:'ignore'}).status===0,desktopBundleAvailable:existsSync(options.entry)};
    if(existsSync(join(this.directory,"setup.json")))this.state=readJSON(join(this.directory,"setup.json"));
  }
  private folder(){if(!this.state)throw Error("SETUP_REQUIRED");return join(this.directory,this.state.id);}
  private save(){atomicPrivate(join(this.directory,"setup.json"),stringify(this.state));}
  private async exclusive<T>(run:()=>Promise<T>){if(this.busy)throw Error("SETUP_OPERATION_IN_PROGRESS");this.busy=true;try{return await run();}finally{this.busy=false;}}
  private network(){const n=this.options.networks.find(n=>n.chainId===this.state?.chainId);if(!n)throw Error("SETUP_NETWORK_UNSUPPORTED");return n;}
  private pc(){const n=this.network();return createPublicClient({transport:http(n.rpc,{timeout:15000,retryCount:0})});}
  private async verifyFactory(){const n=this.network(),pc=this.pc();if(await pc.getChainId()!==n.chainId)throw Error("SETUP_RPC_CHAIN_MISMATCH");const code=await pc.getCode({address:n.factory});if(!code||keccak256(code)!==n.factoryHash)throw Error("SETUP_FACTORY_CODE_MISMATCH");}
  private key(name:string){return privateKeyToAccount(readJSON(join(this.folder(),name+".json")).privateKey);}
  private descriptor(config:GatewayConfig,profilePath:string,credentialPath:string){
    const path=join(this.folder(),"connection.json");atomicPrivate(path,stringify({schemaVersion:1,profilePath:resolve(profilePath),credentialFilePath:resolve(credentialPath),profileSHA256:digest(readFileSync(profilePath)),chainId:config.chainId,wallet:config.wallet,mandateId:config.mandateId,sessionId:config.sessionId}));
    this.state!.profilePath=resolve(profilePath);this.state!.credentialPath=resolve(credentialPath);this.state!.descriptorPath=path;this.save();
  }
  private async activate(profilePath:string,credentialPath:string){
    const credential=readJSON(credentialPath).connectionToken;
    const runtime=await loadGateway(profilePath,credential);
    try{this.workspace=await MandateWorkspace.create(runtime.tools);this.runtime=runtime;this.descriptor(runtime.config,profilePath,credentialPath);}catch(e){runtime.close();throw e;}
  }
  async restore(){
    if(!this.state||this.runtime)return;
    if(this.state.kind==="public"){await this.verifyFactory();if(this.state.wallet)await this.startMerchant();}
    if(this.state.profilePath&&this.state.credentialPath)await this.activate(this.state.profilePath,this.state.credentialPath);
  }
  async importExisting(profilePath:string,credentialPath:string){return this.exclusive(async()=>{
    if(this.state)throw Error("SETUP_ALREADY_EXISTS");
    const runtime=await loadGateway(resolve(profilePath),readJSON(credentialPath).connectionToken);
    try{const c=runtime.config,owner=await runtime.purchase.reader.pc.readContract({address:c.wallet,abi:accountAbi,functionName:"owner"});
      this.state={schemaVersion:1,id:randomBytes(16).toString("hex"),kind:"import",createdAt:new Date().toISOString(),chainId:c.chainId,owner,wallet:c.wallet,asset:c.asset,mandateId:c.mandateId,sessionId:c.sessionId,startBlock:c.startBlock,intents:[]};
      this.workspace=await MandateWorkspace.create(runtime.tools);this.runtime=runtime;this.descriptor(c,profilePath,credentialPath);return this.status();
    }catch(e){runtime.close();this.state=undefined;throw e;}
  });}
  async createLocal(){return this.exclusive(async()=>{
    if(this.state)throw Error("SETUP_ALREADY_EXISTS");
    if(!this.environment.nodeSupported||!this.environment.desktopBundleAvailable)throw Error("SETUP_BUILD_REQUIRED");
    if(!this.environment.anvilAvailable)throw Error("SETUP_ANVIL_REQUIRED");
    const e=await localEnvironment({signedOffersAndReceipts:true,failAfterPayment:true});this.local=e;
    this.clock=setInterval(()=>{void e.pc.request({method:"evm_mine" as never,params:[] as never}).catch(()=>{});},15000);this.clock.unref();
    this.state={schemaVersion:1,id:randomBytes(16).toString("hex"),kind:"local",createdAt:new Date().toISOString(),chainId:31337,owner:e.owner.address,wallet:e.wallet,asset:e.asset,mandateId:e.root,sessionId:e.sessions[0],startBlock:String(e.context(0).startBlock),intents:[]};
    try{
      const folder=this.folder();privateDirectory(folder);
      atomicPrivate(join(folder,"session.json"),stringify({privateKey:toHex(e.agentA.getHdKey().privateKey!)}));
      atomicPrivate(join(folder,"operator.json"),stringify({privateKey:toHex(e.operator.getHdKey().privateKey!)}));
      const token=randomBytes(32).toString("hex"),profile=GatewayConfigSchema.parse({schemaVersion:2,chainId:31337,rpc:e.node.rpc,wallet:e.wallet,asset:e.asset,tokenName:"USDC",tokenVersion:"2",agentId:"setup-agent",mandateId:e.root,sessionId:e.sessions[0],startBlock:this.state.startBlock,sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:join(e.directory,"purchases.sqlite"),evidenceStoreFile:join(e.directory,"setup-evidence.sqlite"),credentialSHA256:digest(token),confirmations:1,services:e.services.map((s,i)=>({serviceId:s.serviceId,stepId:s.stepId,url:s.url,method:s.method,body:null,resultChecker:i===0?"ETH-stats-v2":"BTC-stats-v2"})),testLoopbackOrigins:[e.merchant.origin]});
      atomicPrivate(join(folder,"case-agent.json"),stringify(profile));atomicPrivate(join(folder,"PRIVATE_CONNECTION.json"),stringify({connectionToken:token}));
      await this.activate(join(folder,"case-agent.json"),join(folder,"PRIVATE_CONNECTION.json"));return this.status();
    }catch(error){this.save();this.runtime?.close();this.runtime=undefined;this.workspace=undefined;if(this.clock)clearInterval(this.clock);await e.close();this.local=undefined;throw error;}
  });}
  async beginPublic(chainId:number,ownerInput:string){return this.exclusive(async()=>{
    if(this.state)throw Error("SETUP_ALREADY_EXISTS");
    if(!this.environment.nodeSupported||!this.environment.desktopBundleAvailable)throw Error("SETUP_BUILD_REQUIRED");
    const owner=address.parse(ownerInput),network=this.options.networks.find(n=>n.chainId===chainId);if(!network)throw Error("SETUP_NETWORK_UNSUPPORTED");
    this.state={schemaVersion:1,id:randomBytes(16).toString("hex"),kind:"public",createdAt:new Date().toISOString(),chainId,owner,asset:network.asset,salt:toHex(randomBytes(32)),mandateId:toHex(randomBytes(32)),sessionId:toHex(randomBytes(32)),startBlock:"0",intents:[]};
    try{await this.verifyFactory();privateDirectory(this.folder());for(const name of ["session","operator","merchant"])atomicPrivate(join(this.folder(),name+".json"),stringify({privateKey:generatePrivateKey()}));
      this.state.wallet=await this.pc().readContract({address:network.factory,abi:factoryAbi,functionName:"predictAccount",args:[owner,network.asset,this.state.salt!]});this.save();return this.status();
    }catch(e){this.state=undefined;throw e;}
  });}
  private async startMerchant(){
    if(this.merchant)return;if(!this.state?.wallet)throw Error("SETUP_WALLET_REQUIRED");
    const s=this.state,n=this.network(),pc=this.pc(),operator=this.key("operator"),quote=this.key("merchant");
    this.facilityStore=new PurchaseStore(join(this.folder(),"purchases.sqlite"));
    const chain={id:n.chainId,name:n.name,nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[n.rpc]}}};
    const tx=new DurableTransactions(pc,createWalletClient({chain,account:operator,transport:http(n.rpc)}),this.facilityStore,10n**15n,1);
    try{this.merchant=await startControlledMerchant({pc,facilitator:controlledFacilitator(tx),chainId:n.chainId,asset:n.asset,payTo:quote.address,quoteSigner:quote,allowedWallets:[s.wallet!],dbPath:join(this.folder(),"merchant.sqlite"),port:s.merchantPort,confirmations:1,failAfterPayment:true,signedOffersAndReceipts:true});}
    catch(e){this.facilityStore.close();this.facilityStore=undefined;throw e;}
    s.merchantPort=Number(new URL(this.merchant.origin).port);
    s.services=["ETH","BTC"].map(symbol=>({serviceId:keccak256(toHex(s.id+symbol)),stepId:keccak256(toHex(s.id+"step"+symbol)),method:"GET",url:this.merchant!.origin+"/stats?asset="+symbol,body:null,resultChecker:symbol==="ETH"?"ETH-stats-v2":"BTC-stats-v2"}));this.save();
  }
  async prepare(kind:IntentKind){return this.exclusive(async()=>{
    const s=this.state;if(s?.kind!=="public"||!s.wallet)throw Error("SETUP_PUBLIC_WALLET_REQUIRED");await this.verifyFactory();
    const existing=s.intents.find(i=>i.kind===kind&&i.state!=="rejected");if(existing)return existing;
    const n=this.network(),pc=this.pc();let to:Address,data:Hex,value="0";
    const confirmed=(k:IntentKind)=>s.intents.some(i=>i.kind===k&&i.state==="confirmed");
    if(kind==="account"){to=n.factory;data=encodeFunctionData({abi:factoryAbi,functionName:"createAccount",args:[n.asset,s.salt!]});}
    else{
      if(!confirmed("account"))throw Error("SETUP_ACCOUNT_CONFIRMATION_REQUIRED");
      if(kind==="fund-usdc"){to=n.asset;data=encodeFunctionData({abi:testTokenAbi,functionName:"transfer",args:[s.wallet,150000n]});}
      else if(kind==="fund-gas"){to=this.key("operator").address;data="0x";value="1000000000000000";}
      else{
        await this.startMerchant();
        if(!s.expiresAt){s.expiresAt=Number((await pc.getBlock()).timestamp)+3600;this.save();}
        if(s.expiresAt<=Number((await pc.getBlock()).timestamp))throw Error("SETUP_PERMISSION_WINDOW_EXPIRED");
        const merchantId=keccak256(toHex(s.id+"merchant")),quote=this.key("merchant");to=s.wallet;
        if(kind==="mandate")data=encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[s.mandateId,keccak256(toHex("Purchase fixed ETH statistics and write a brief")),{budget:150000n,maxPerPayment:100000n,expiresAt:BigInt(s.expiresAt)},[{id:merchantId,payTo:quote.address,quoteSigner:quote.address}],s.services!.map(v=>({id:v.stepId,merchantId,requestHash:requestHash({...v,body:v.body??null})}))]});
        else{if(!confirmed("mandate"))throw Error("SETUP_MANDATE_CONFIRMATION_REQUIRED");data=encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[s.mandateId,s.sessionId,this.key("session").address,150000n,100000n,BigInt(s.expiresAt),s.services!.map(v=>v.stepId)]});}
      }
    }
    const intent:Intent={id:randomBytes(16).toString("hex"),kind,state:"prepared",from:s.owner,to,data,value,chainId:s.chainId,summary:{asset:s.asset,budgetAtomic:"150000",maxPaymentAtomic:"100000",expiresAt:s.expiresAt,recipient:s.services?this.key("merchant").address:undefined,resources:s.services?.map(v=>v.method+' '+v.url)??[]}};
    try{await pc.call({account:intent.from,to,data,value:BigInt(value)});}catch{throw Error("SETUP_TRANSACTION_SIMULATION_FAILED");}s.intents.push(intent);this.save();return intent;
  });}
  mark(id:string,state:"awaiting-wallet"|"rejected"|"submission-unknown"){
    const i=this.intent(id);
    if(state==="awaiting-wallet"&&i.state!=="prepared"||state!=="awaiting-wallet"&&i.state!=="awaiting-wallet")throw Error("SETUP_RECONCILE_FIRST");
    i.state=state;this.save();return i;
  }
  private intent(id:string){const i=this.state?.intents.find(i=>i.id===id);if(!i)throw Error("SETUP_INTENT_NOT_FOUND");return i;}
  async broadcast(id:string,hash:Hex){return this.exclusive(async()=>{
    const i=this.intent(id);if(i.hash&&i.hash!==hash)throw Error("SETUP_ORIGINAL_HASH_FROZEN");
    if(!["awaiting-wallet","broadcast","submission-unknown"].includes(i.state))throw Error("SETUP_WALLET_REVIEW_REQUIRED");
    i.hash=hash;i.state="broadcast";this.save();return this.reconcileIntent(i);
  });}
  private async reconcileIntent(i:Intent){
    if(!i.hash)return i;const pc=this.pc();i.state="broadcast";delete i.block;this.save();
    let tx;try{tx=await pc.getTransaction({hash:i.hash});}catch{return i;}
    if(!isAddressEqual(tx.from,i.from)||!tx.to||!isAddressEqual(tx.to,i.to)||tx.input.toLowerCase()!==i.data.toLowerCase()||tx.value!==BigInt(i.value)){
      i.state="failed";i.error="SETUP_TRANSACTION_INTENT_MISMATCH";this.save();throw Error(i.error);
    }
    let receipt;try{receipt=await pc.getTransactionReceipt({hash:i.hash});}catch{i.state="broadcast";this.save();return i;}
    const canonical=await pc.getBlock({blockNumber:receipt.blockNumber});
    if(canonical.hash!==receipt.blockHash){i.state="broadcast";this.save();return i;}
    if(receipt.status!=="success"){i.state="failed";i.error="SETUP_TRANSACTION_REVERTED";this.save();return i;}
    i.block=String(receipt.blockNumber);i.state="confirmed";
    if(i.kind==="account"){
      const s=this.state!,walletOwner=await pc.readContract({address:s.wallet!,abi:accountAbi,functionName:"owner"}),asset=await pc.readContract({address:s.wallet!,abi:accountAbi,functionName:"asset"});
      if(!isAddressEqual(walletOwner,s.owner)||!isAddressEqual(asset,s.asset))throw Error("SETUP_DEPLOYMENT_IDENTITY_MISMATCH");s.startBlock=String(receipt.blockNumber);
    }
    this.save();return i;
  }
  async reconcile(id:string){return this.exclusive(()=>this.reconcileIntent(this.intent(id)));}
  async finishPublic(){return this.exclusive(async()=>{
    if(this.workspace)return this.status();
    const s=this.state;if(s?.kind!=="public"||!s.wallet)throw Error("SETUP_PUBLIC_WALLET_REQUIRED");
    for(const kind of ["account","mandate","session"]){const i=s.intents.find(i=>i.kind===kind);if(!i||(await this.reconcileIntent(i)).state!=="confirmed")throw Error("SETUP_PERMISSIONS_NOT_CONFIRMED");}
    const pc=this.pc(),balance=await pc.readContract({address:s.asset,abi:testTokenAbi,functionName:"balanceOf",args:[s.wallet]}),gas=await pc.getBalance({address:this.key("operator").address});
    if(balance<10000n||gas===0n)throw Error("SETUP_TEST_FUNDS_REQUIRED");await this.startMerchant();
    const folder=this.folder(),token=existsSync(join(folder,"PRIVATE_CONNECTION.json"))?readJSON(join(folder,"PRIVATE_CONNECTION.json")).connectionToken:randomBytes(32).toString("hex");
    const tokenName=await pc.readContract({address:s.asset,abi:testTokenAbi,functionName:"name"});
    const actualDomain=await pc.readContract({address:s.asset,abi:testTokenAbi,functionName:"DOMAIN_SEPARATOR"});
    if(actualDomain!==domainSeparator(tokenName,"2",s.chainId,s.asset))throw Error("SETUP_TOKEN_DOMAIN_UNSUPPORTED");
    const c=GatewayConfigSchema.parse({schemaVersion:2,chainId:s.chainId,rpc:this.network().rpc,wallet:s.wallet,asset:s.asset,tokenName,tokenVersion:"2",agentId:"setup-agent",mandateId:s.mandateId,sessionId:s.sessionId,startBlock:s.startBlock,sessionKeyFile:"session.json",operatorKeyFile:"operator.json",storeFile:"purchases.sqlite",evidenceStoreFile:"evidence.sqlite",credentialSHA256:digest(token),confirmations:1,services:s.services,testLoopbackOrigins:[this.merchant!.origin]});
    atomicPrivate(join(folder,"case-agent.json"),stringify(c));atomicPrivate(join(folder,"PRIVATE_CONNECTION.json"),stringify({connectionToken:token}));
    await this.activate(join(folder,"case-agent.json"),join(folder,"PRIVATE_CONNECTION.json"));return this.status();
  });}
  integration(){
    if(!this.state?.descriptorPath||!this.workspace)throw Error("SETUP_CONNECTION_NOT_READY");
    if(!this.host||this.hostDescriptor!==this.state.descriptorPath){this.hostDescriptor=this.state.descriptorPath;this.host=new HostIntegration({...this.options,node:process.execPath,entry:resolve(this.options.entry),connection:this.state.descriptorPath});}return this.host;
  }
  authenticate(token:string|undefined){if(!this.runtime)throw Error("SETUP_CONNECTION_NOT_READY");authenticateCredential(this.runtime.config.credentialSHA256,token);this.runtime.authorizeConnection();}
  async revokeLocal(){return this.exclusive(async()=>{
    if(this.state?.kind!=="local"||!this.local)throw Error("SETUP_LOCAL_TEST_ONLY");
    const result=await this.local.send(this.state.wallet!,encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[this.state.mandateId,this.state.sessionId]}));
    return {status:"revoked",transactionHash:result.transactionHash,chainId:31337,publicTransactions:0};
  });}
  async checkConnection(){return this.exclusive(async()=>{
    if(!this.state?.descriptorPath)throw Error("SETUP_CONNECTION_NOT_READY");
    const client=new Client({name:"mandate-setup-check",version:"1.0.0"}),transport=new StdioClientTransport({command:process.execPath,args:[resolve(this.options.entry),"--connection",this.state.descriptorPath],stderr:"pipe"});
    try{await client.connect(transport);const list=await client.listTools(),r=await client.callTool({name:"mandate_get_context",arguments:{}});if(r.isError)throw Error("SETUP_MCP_CONTEXT_FAILED");
      const context=JSON.parse((r.content as {text:string}[])[0].text);for(const key of ["chainId","wallet","mandateId","sessionId"] as const)if(String(context[key]).toLowerCase()!==String(this.state[key]).toLowerCase())throw Error("SETUP_MCP_IDENTITY_MISMATCH");
      if(list.tools.length!==8)throw Error("SETUP_MCP_TOOLS_MISSING");this.lastCheck={passed:true,toolCount:list.tools.length,checkedAt:new Date().toISOString(),scope:"independent-stdio-process",modelToolCallVerified:false};
      atomicPrivate(join(this.folder(),"connection-check.json"),stringify(this.lastCheck));return this.lastCheck;
    }finally{await client.close();await transport.close();}
  });}
  async status(){
    let context:unknown,error:string|undefined,executionReady=false;
    if(this.runtime){try{context=await this.runtime.tools.call("mandate_get_context",{});const b=await this.runtime.purchase.reader.readBudget(this.state!.mandateId,this.state!.sessionId);executionReady=b.policy.exists&&!b.policy.revoked&&!b.policy.paused&&b.session.exists&&!b.session.revoked&&b.session.policyVersion===b.policy.version&&b.policy.expiresAt>BigInt(Math.floor(Date.now()/1000))&&b.session.expiresAt>BigInt(Math.floor(Date.now()/1000))&&b.rootAvailable>=10000n&&b.grantAvailable>=10000n;}catch{error="SETUP_RUNTIME_UNAVAILABLE";}}
    return {schemaVersion:1,busy:this.busy,environment:this.environment,state:this.state?{id:this.state.id,kind:this.state.kind,chainId:this.state.chainId,owner:this.state.owner,wallet:this.state.wallet,asset:this.state.asset,mandateId:this.state.mandateId,sessionId:this.state.sessionId,intents:this.state.intents,expiresAt:this.state.expiresAt,services:this.state.services,approvedMerchant:this.state.kind==='public'&&this.state.services?this.key('merchant').address:undefined}:null,connectionReady:!!this.workspace,executionReady,context,error,connectionCheck:this.lastCheck??null,networks:this.options.networks.map(n=>({chainId:n.chainId,name:n.name})),manualDocumentation:"http://127.0.0.1:18742/docs.html#case",publicLimits:{budgetUSDC:"0.15",maxPaymentUSDC:"0.10",servicePriceUSDC:"0.01",operatorETH:"0.001"}};
  }
  async close(){if(this.clock)clearInterval(this.clock);this.runtime?.close();await this.merchant?.close();this.facilityStore?.close();await this.local?.close();}
}
