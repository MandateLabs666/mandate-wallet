import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createPublicClient,createWalletClient,http,encodeDeployData,encodeFunctionData,keccak256,toHex,getAddress,type Hex,type Address,type Abi,type Chain} from "viem";
import {privateKeyToAccount,generatePrivateKey} from "viem/accounts";
import {sepolia,baseSepolia} from "viem/chains";
import {M3Journal,type TransactionContext} from "./journal.js";
import {factoryAbi} from "../sdk/factoryAbi.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {MandateReader} from "../sdk/reader.js";
process.umask(0o077);
const sourceCommit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
if(execFileSync("git",["status","--porcelain","--","mandate","planning/M3_SPEC.zh-CN.md","schemas/m3-payment.schema.json"],{encoding:"utf8"}).trim())throw new Error("COMMIT_M3_SOURCE_FIRST");
const core=JSON.parse(readFileSync("artifacts/m3/core-acceptance.json","utf8"));
if(core.T3!=="completed")throw new Error("T3_PREREQUISITE");
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8"));
const probes=JSON.parse(readFileSync("artifacts/m3/network-probes.json","utf8"));
const privateDirectory=".runtime/m3";mkdirSync(privateDirectory+"/keys",{recursive:true,mode:0o700});
function key(path:string){return privateKeyToAccount(JSON.parse(readFileSync(path,"utf8")).privateKey as Hex);}
for(const name of ["agent-a","agent-b"]) {
  const path=`${privateDirectory}/keys/${name}.json`;
  if(!existsSync(path))writeFileSync(path,JSON.stringify({privateKey:generatePrivateKey()}),{mode:0o600});
}
const agents=[key(privateDirectory+"/keys/agent-a.json"),key(privateDirectory+"/keys/agent-b.json")];
const m1=JSON.parse(readFileSync("artifacts/test-accounts.json","utf8"));
function artifact(name:string){return JSON.parse(readFileSync(`mandate/contracts/out/${name}.sol/${name}.json`,"utf8"));}
function write(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");}
for(const spec of settings.networks.filter((s:{readOnly:boolean})=>!s.readOnly)) {
  const network:Chain=spec.chainId===11155111?sepolia:baseSepolia;
  const deployer=key(spec.chainId===11155111?".runtime/m2/keys/deployer.json":".runtime/keys/owner.json"),owner=key(spec.chainId===11155111?".runtime/m2/keys/owner.json":".runtime/keys/owner.json");
  const pc=createPublicClient({chain:network,transport:http(spec.rpc,{timeout:20000,retryCount:0}),pollingInterval:5000});
  if((await pc.getChainId())!==spec.chainId)throw new Error("RPC_CHAIN_MISMATCH");
  const createContext=(account:ReturnType<typeof key>):TransactionContext=>({pc,wc:createWalletClient({chain:network,account,transport:http(spec.rpc,{timeout:20000,retryCount:0})})});
  const journal=new M3Journal(`${privateDirectory}/${spec.chainId}-deploy-journal.json`,BigInt(settings.m3PublicLimits.evmGasReservationsWeiPerChain));
  const reportPath=`artifacts/m3/${spec.chainId}-deployment.json`;
  const report:{schemaVersion:number;chainId:number;sourceCommit:string;contracts:Record<string,unknown>;transactions:unknown[];roles:Record<string,unknown>;limitations:string[]}={schemaVersion:2,chainId:spec.chainId,sourceCommit,contracts:{},transactions:[],roles:{deployer:deployer.address,owner:owner.address,agents:agents.map(a=>a.address),merchant:m1.addresses.merchant},limitations:["Public RPC trust; cross-provider deployment/runtime and source verification pending.","Ethereum Sepolia uses labelled TestUSDC fixture; Base Sepolia uses native test USDC.","No EntryPoint required for ERC-1271/EIP-3009 purchase; M2 evidence is independent."]};
  function save(){report.transactions=journal.evidence();write(reportPath,report);}
  async function deploy(name:string) {
    const a=artifact(name),receipt=await journal.send("deploy-"+name,createContext(deployer),{data:encodeDeployData({abi:a.abi as Abi,bytecode:a.bytecode.object as Hex})});
    if(!receipt.contractAddress)throw new Error("DEPLOYMENT_ADDRESS_MISSING");
    report.contracts[name]={address:receipt.contractAddress,hash:receipt.transactionHash,block:receipt.blockNumber};save();return receipt.contractAddress;
  }
  try {
    const factory=await deploy("MandateFactory");
    const asset=spec.chainId===11155111?await deploy("TestUSDC"):getAddress(spec.nativeUSDC);
    const salt=keccak256(toHex("Mandate-competition-M3-v2"));
    const wallet=await pc.readContract({address:factory,abi:factoryAbi,functionName:"predictAccount",args:[owner.address,asset,salt]});
    const receipt=await journal.send("create-account",createContext(owner),{to:factory,data:encodeFunctionData({abi:factoryAbi,functionName:"createAccount",args:[asset,salt]})});
    const code=await pc.getCode({address:wallet});
    if(!code || code==="0x")throw new Error("ACCOUNT_CODE_MISSING");
    const metadata=probes.observations.find((o:{chainId:number})=>o.chainId===spec.chainId)?.asset;
    if(!metadata)throw new Error("NETWORK_PROBE_MISSING");
    const domain={name:spec.chainId===11155111?"USDC":metadata.name,version:spec.chainId===11155111?"2":metadata.version,chainId:spec.chainId,verifyingContract:asset};
    await new MandateReader(pc,spec.chainId,wallet,domain).verifyContext();
    if((await pc.readContract({address:wallet,abi:accountAbi,functionName:"owner"})).toLowerCase()!==owner.address.toLowerCase())throw new Error("OWNER_MISMATCH");
    report.contracts.MandateAccount={address:wallet,hash:receipt.transactionHash,block:receipt.blockNumber,factory,owner:owner.address,asset,salt};
    write(`${privateDirectory}/${spec.chainId}-config.json`,{schemaVersion:2,chainId:spec.chainId,rpc:spec.rpc,witnessRpc:spec.witnessRpc,wallet,factory,asset,assetKind:spec.chainId===11155111?"TestUSDC-fixture":"native-test-USDC",tokenDomain:domain,owner:owner.address,agents:agents.map(a=>a.address),merchant:m1.addresses.merchant,sourceCommit,startBlock:receipt.blockNumber});
    save();console.log(JSON.stringify({chainId:spec.chainId,factory,wallet,assetKind:spec.chainId===11155111?"fixture":"native-test-USDC",status:"deployed-not-yet-accepted"}));
  } finally{save();}
}
