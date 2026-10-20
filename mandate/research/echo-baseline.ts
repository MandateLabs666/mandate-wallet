import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createPublicClient,createWalletClient,http,encodeFunctionData,encodePacked,parseEventLogs,keccak256,type Abi,type Address,type Hex,type TransactionReceipt} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {startAnvil,TEST_MNEMONIC} from "../examples/local-node.js";

const protocol=JSON.parse(readFileSync("mandate/research/protocol.json","utf8")),directory=resolve(process.argv[2]??"artifacts/m7/benchmarks/echo");
mkdirSync(directory,{recursive:true});if(existsSync(directory+"/summary.json"))throw Error("BASELINE_OUTPUT_ALREADY_EXISTS");
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x,2)+"\n",save=(name:string,v:unknown)=>writeFileSync(directory+"/"+name,json(v));
const node=await startAnvil({timestamp:protocol.genesisTimestamp});
try{
  const chain={id:31337,name:"M7 local Echo baseline",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[node.rpc]}}};
  const roles=Array.from({length:5},(_,addressIndex)=>mnemonicToAccount(TEST_MNEMONIC,{addressIndex})),[admin,owner,execute,session,bundler]=roles;
  const pc=createPublicClient({chain,transport:http(node.rpc,{timeout:10000,retryCount:0}),pollingInterval:50});await pc.request({method:"anvil_setBlockTimestampInterval" as never,params:[1] as never});
  const client=(account:typeof admin)=>createWalletClient({chain,account,transport:http(node.rpc,{retryCount:0})});
  const adminWallet=client(admin),ownerWallet=client(owner),bundlerWallet=client(bundler),setup:unknown[]=[],artifacts:Record<string,any>={};
  const artifact=(name:string)=>{
    if(artifacts[name])return artifacts[name];
    const path=name==="EntryPoint"?"artifacts/m2/EntryPoint.v0.7.json":`echo/contracts/out/${name}.sol/${name}.json`;
    const a=JSON.parse(readFileSync(path,"utf8"));
    if(name!=="EntryPoint")for(const [file,source] of Object.entries(a.metadata.sources) as [string,{keccak256:Hex}][])if(keccak256(readFileSync(resolve("echo/contracts",file)))!==source.keccak256)throw Error("ECHO_COMPILED_SOURCE_MISMATCH");
    return artifacts[name]={...a,sourceFile:path,artifactSHA256:createHash("sha256").update(readFileSync(path)).digest("hex")};
  };
  const publicReceipt=(r:TransactionReceipt)=>({transactionHash:r.transactionHash,blockNumber:r.blockNumber,blockHash:r.blockHash,status:r.status,gasUsed:r.gasUsed,effectiveGasPrice:r.effectiveGasPrice,transactionFeeWei:r.gasUsed*r.effectiveGasPrice,logs:r.logs});
  async function receipt(hash:Hex){const r=await pc.waitForTransactionReceipt({hash});if((await pc.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash)throw Error("BASELINE_RECEIPT_NOT_CANONICAL");return r;}
  async function deploy(name:string,args:unknown[]=[]){const a=artifact(name),r=await receipt(await adminWallet.deployContract({abi:a.abi as Abi,bytecode:a.bytecode.object as Hex,args}));if(r.status!=="success"||!r.contractAddress)throw Error("BASELINE_DEPLOY_FAILED");setup.push({name,...publicReceipt(r),address:r.contractAddress});return r.contractAddress;}
  async function send(wc:typeof adminWallet,address:Address,name:string,functionName:string,args:unknown[]=[],value=0n){const r=await receipt(await wc.sendTransaction({to:address,data:encodeFunctionData({abi:artifact(name).abi,functionName,args}),value}));if(r.status!=="success")throw Error("BASELINE_SETUP_REVERTED");setup.push({name:functionName,...publicReceipt(r)});return r;}
  const ep=await deploy("EntryPoint"),registry=await deploy("PolicyRegistry",[admin.address]),decoder=await deploy("EchoIntentDecoder"),validator=await deploy("EchoPolicyValidator"),implementation=await deploy("EchoDelegationModule",[registry,decoder,validator,ep]),onboarding=await deploy("EchoOnboarding",[registry]);
  await send(adminWallet,registry,"PolicyRegistry","setImplementation",[implementation]);await send(adminWallet,registry,"PolicyRegistry","setOnboarding",[onboarding]);
  const authorization=await ownerWallet.signAuthorization({contractAddress:implementation,executor:bundler});const attachment=await receipt(await bundlerWallet.sendTransaction({to:owner.address,authorizationList:[authorization]}));setup.push({name:"type-4-delegation",...publicReceipt(attachment)});
  if((await pc.getCode({address:owner.address}))?.toLowerCase()!==("0xef0100"+implementation.slice(2)).toLowerCase())throw Error("REAL_DELEGATION_ATTACHMENT_FAILED");
  // Both token fixture contracts are compiled from MockTokens.sol.
  for(const name of ["MockInputToken","MockOutputToken"]){const path=`echo/contracts/out/MockTokens.sol/${name}.json`,a=JSON.parse(readFileSync(path,"utf8"));artifacts[name]={...a,sourceFile:path,artifactSHA256:createHash("sha256").update(readFileSync(path)).digest("hex")};}
  const input=await deploy("MockInputToken"),output=await deploy("MockOutputToken"),router=await deploy("MockSwapRouter",[input,output]);await send(adminWallet,input,"MockInputToken","mint",[owner.address,1000000n]);
  const expiry=Number((await pc.getBlock()).timestamp+3600n),created=await send(ownerWallet,onboarding,"EchoOnboarding","registerInstanceAndEip7702",[{budgetAsset:input,router,executeSigner:execute.address,outputs:[output],maxPerOp:100000n,maxPerDay:150000n,totalBudget:150000n,expiry}]);
  const instance=(parseEventLogs({abi:artifact("PolicyRegistry").abi,eventName:"InstanceRegistered",logs:created.logs})[0] as any).args.instanceId as Hex;
  const granted=await send(ownerWallet,registry,"PolicyRegistry","createSession",[instance,session.address,output,100000n,150000n,5n,expiry]);const sid=(parseEventLogs({abi:artifact("PolicyRegistry").abi,eventName:"SessionCreated",logs:granted.logs})[0] as any).args.sessionId as Hex;
  await send(ownerWallet,ep,"EntryPoint","depositTo",[owner.address],10n**18n);
  const read=async(address:Address,name:string,functionName:string,args:unknown[]=[])=>pc.readContract({address,abi:artifact(name).abi,functionName,args});
  const inputAmount=BigInt(protocol.normalTasks.find((t:any)=>t.id==="N03").priceAtomic),zero=("0x"+"00".repeat(32)) as Hex,pack=(high:bigint,low:bigint)=>("0x"+((high<<128n)|low).toString(16).padStart(64,"0")) as Hex;
  const samples:unknown[]=[];
  async function run(role:"execute"|"session",repeat:number,amount:bigint,expectSuccess:boolean){
    const started=performance.now(),nonce=await read(ep,"EntryPoint","getNonce",[owner.address,0n]) as bigint,now=(await pc.getBlock()).timestamp;
    const auth={instanceId:instance,policyVersion:1n,sessionId:role==="session"?sid:zero,authorityEpoch:1n,validAfter:0,validUntil:Number(now+300n),nonce};
    const minOutput=amount*10n**18n/(2000n*10n**6n),inner=encodeFunctionData({abi:artifact("MockSwapRouter").abi,functionName:"exactInputSingle",args:[{tokenIn:input,tokenOut:output,fee:500,recipient:owner.address,deadline:now+300n,amountIn:amount,amountOutMinimum:minOutput,sqrtPriceLimitX96:0n}]});
    const op={sender:owner.address,nonce,initCode:"0x" as Hex,callData:encodeFunctionData({abi:artifact("EchoDelegationModule").abi,functionName:"execute",args:[zero,encodePacked(["address","uint256","bytes"],[router,0n,inner]),auth]}),accountGasLimits:pack(500000n,1000000n),preVerificationGas:100000n,gasFees:pack(1000000000n,2000000000n),paymasterAndData:"0x" as Hex,signature:"0x" as Hex};
    const userOpHash=await read(ep,"EntryPoint","getUserOpHash",[op]) as Hex,digest=await read(validator,"EchoPolicyValidator","digest",[owner.address,ep,implementation,userOpHash,auth]) as Hex;
    op.signature=("0x02"+(await (role==="session"?session:execute).sign({hash:digest})).slice(2)) as Hex;
    const prepareMs=performance.now()-started,before={input:await read(input,"MockInputToken","balanceOf",[owner.address]) as bigint,output:await read(output,"MockOutputToken","balanceOf",[owner.address]) as bigint,deposit:await read(ep,"EntryPoint","balanceOf",[owner.address]) as bigint};
    const submitted=performance.now(),r=await receipt(await bundlerWallet.sendTransaction({to:ep,data:encodeFunctionData({abi:artifact("EntryPoint").abi,functionName:"handleOps",args:[[op],bundler.address]}),gas:3000000n})),submitReceiptMs=performance.now()-submitted,checkStarted=performance.now();
    const event=(parseEventLogs({abi:artifact("EntryPoint").abi,eventName:"UserOperationEvent",logs:r.logs}) as any[]).find(e=>e.args.userOpHash===userOpHash)?.args;
    if(!event||r.status!=="success"||event.success!==expectSuccess)throw Error("ECHO_BASELINE_USER_OPERATION_RESULT_MISMATCH");
    const swaps=(parseEventLogs({abi:artifact("EchoDelegationModule").abi,eventName:"SwapExecuted",logs:r.logs.filter(log=>log.address.toLowerCase()===owner.address.toLowerCase())}) as any[]).filter(e=>e.args.nonce===nonce&&e.args.instanceId===instance&&e.args.sessionId===auth.sessionId);
    if(swaps.length!==(expectSuccess?1:0)||expectSuccess&&(swaps[0].args.actualInput!==amount||swaps[0].args.actualOutput!==minOutput))throw Error("ECHO_SWAP_EVENT_MISMATCH");
    const after={input:await read(input,"MockInputToken","balanceOf",[owner.address]) as bigint,output:await read(output,"MockOutputToken","balanceOf",[owner.address]) as bigint,deposit:await read(ep,"EntryPoint","balanceOf",[owner.address]) as bigint};
    if(before.input-after.input!==(expectSuccess?amount:0n)||after.output-before.output!==(expectSuccess?minOutput:0n)||await read(input,"MockInputToken","allowance",[owner.address,router])!==0n||after.deposit>=before.deposit||before.deposit-after.deposit!==event.actualGasCost)throw Error("ECHO_BASELINE_BALANCE_OR_FEE_MISMATCH");
    const row={baseline:"B0",action:"controlled-swap",role,repeat,normal:expectSuccess,expectedSuccess:expectSuccess,userOperationSuccess:event.success,userOpHash,nonce,requestedInputAtomic:amount,actualInputAtomic:before.input-after.input,actualOutputAtomic:after.output-before.output,ownerEntryPointDebitWei:before.deposit-after.deposit,userOperationActualGasUsed:event.actualGasUsed,transaction:publicReceipt(r),phasesMs:{prepare:prepareMs,preflightRead:submitted-started-prepareMs,submitReceipt:submitReceiptMs,reconcile:performance.now()-checkStarted,total:performance.now()-started},inputDecimals:6,outputDecimals:18,preVerificationGas:op.preVerificationGas,verificationGasLimit:"500000",callGasLimit:"1000000",gasMaxPriorityFeePerGasWei:"1000000000",gasMaxFeePerGasWei:"2000000000"};
    samples.push(row);save("samples.json",samples);console.log(json({role,repeat,success:event.success,actualInput:row.actualInputAtomic,gas:r.gasUsed}).trim());
  }
  const baseline=protocol.baselines.find((b:any)=>b.id==="B0");for(const role of baseline.signers as ("execute"|"session")[])for(let repeat=0;repeat<baseline.perRoleRepetitions;repeat++)await run(role,repeat,inputAmount,true);
  await run("execute",0,100000n,false);
  const policy=await read(registry,"PolicyRegistry","getPolicy",[instance]) as any;if(policy.totalSpent!==100000n)throw Error("ECHO_BASELINE_TOTAL_SPEND_MISMATCH");
  const contracts=Object.fromEntries(await Promise.all(Object.entries({EntryPoint:ep,PolicyRegistry:registry,EchoIntentDecoder:decoder,EchoPolicyValidator:validator,EchoDelegationModule:implementation,EchoOnboarding:onboarding,MockInputToken:input,MockOutputToken:output,MockSwapRouter:router}).map(async([name,address])=>[name,{address,runtimeHash:keccak256((await pc.getCode({address}))!),artifactSHA256:artifact(name).artifactSHA256}])));
  const sources=["mandate/research/echo-baseline.ts","mandate/research/protocol.json","mandate/examples/local-node.ts","planning/M7_EXPERIMENT_PROTOCOL.zh-CN.md","artifacts/m2/EntryPoint.v0.7.json","pnpm-lock.yaml"];
  save("manifest.json",{schemaVersion:1,sourceBaseCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),recordedAt:new Date().toISOString(),protocolId:protocol.protocolId,chainId:31337,genesisTimestamp:protocol.genesisTimestamp,roles:Object.fromEntries(["admin","owner","execute","session","bundler"].map((name,i)=>[name,roles[i].address])),contracts,sourceSHA256:Object.fromEntries(sources.map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),strictBundlerUsed:false,publicStrictBundlerEvidence:"artifacts/m2/sepolia-evidence.json",newPublicTransactions:0});
  save("setup.json",setup);save("summary.json",{schemaVersion:1,baseline:"B0",normalOperations:10,executeSuccess:5,sessionSuccess:5,executionBudgetFailure:1,outerTransactionsSucceeded:11,totalInputAtomic:"100000",endingInputBalanceAtomic:String(await read(input,"MockInputToken","balanceOf",[owner.address])),remainingPolicyBudgetAtomic:"50000",gasSource:"canonical local transaction receipts and EntryPoint UserOperationEvent",userOpChargesAreNotAddedToOuterTransactionFees:true,setupExcludedFromOperationLatency:true,samePaidHTTPTask:false,controlledRouter:true,newPublicTransactions:0,allPassed:true});
}finally{node.stop();}
