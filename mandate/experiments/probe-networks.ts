// Read-only: no signing keys, transaction broadcast or wallet client.
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import {createPublicClient,http,getAddress,keccak256,toBytes,parseAbi,type Hex} from "viem";
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8"));
const abi=parseAbi(["function decimals() view returns (uint8)","function name() view returns (string)","function version() view returns (string)","function DOMAIN_SEPARATOR() view returns (bytes32)"]);
const slots=["0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",keccak256(toBytes("org.zeppelinos.proxy.implementation"))] as Hex[];
const observations=[];
for(const spec of settings.networks) {
  const pc=createPublicClient({transport:http(spec.rpc,{timeout:20000,retryCount:0})}),witness=createPublicClient({transport:http(spec.witnessRpc,{timeout:20000,retryCount:0})});
  const asset=getAddress(spec.nativeUSDC);
  const chain=await pc.getChainId(), witnessChain=await witness.getChainId();
  if(chain!==spec.chainId || witnessChain!==spec.chainId)throw new Error("RPC_CHAIN_MISMATCH");
  const a=await pc.getBlock({blockTag:"finalized"}),b=await witness.getBlock({blockTag:"finalized"});
  const height=a.number!<b.number!?a.number!:b.number!;
  const first=await pc.getBlock({blockNumber:height}),second=await witness.getBlock({blockNumber:height});
  if(first.hash!==second.hash)throw new Error("FINALIZED_ANCHOR_MISMATCH");
  const stateQuery=spec.readOnly?{blockTag:"latest" as const}:{blockNumber:height};
  const code=await pc.getCode({address:asset,...stateQuery}),witnessCode=await witness.getCode({address:asset,...stateQuery});
  if(!code || code==="0x" || code!==witnessCode)throw new Error("ASSET_CODE_MISMATCH");
  const values=[];
  for(const slot of slots) {
    const primary=await pc.getStorageAt({address:asset,slot,...stateQuery}), secondState=await witness.getStorageAt({address:asset,slot,...stateQuery});
    if(primary!==secondState)throw new Error("PROXY_SLOT_MISMATCH");
    values.push(primary);
  }
  const implementation=values.filter(x=>x && BigInt(x)!==0n).map(x=>getAddress("0x"+x!.slice(-40)))[0];
  if(!implementation)throw new Error("PROXY_IMPLEMENTATION_NOT_FOUND");
  const implementationCode=await pc.getCode({address:implementation,...stateQuery}),witnessImplementation=await witness.getCode({address:implementation,...stateQuery});
  if(!implementationCode || implementationCode==="0x" || implementationCode!==witnessImplementation)throw new Error("IMPLEMENTATION_CODE_MISMATCH");
  const metadata:Record<string,unknown>={};
  for(const functionName of ["decimals","name","version","DOMAIN_SEPARATOR"] as const)
    metadata[functionName]=await pc.readContract({address:asset,abi,functionName,...stateQuery});
  if(metadata.decimals!==6)throw new Error("ASSET_DECIMALS_MISMATCH");
  const ep=getAddress(spec.entryPoint),epCode=await pc.getCode({address:ep,...stateQuery});
  observations.push({chainId:chain,readOnly:spec.readOnly,rpc:spec.rpc,witnessRpc:spec.witnessRpc,anchor:{block:height,hash:first.hash},stateObservation:spec.readOnly?"latest-per-provider (archive unavailable)":"common-finalized-block",asset:{address:asset,...metadata,proxyCodeHash:keccak256(code),implementation,implementationCodeHash:keccak256(implementationCode)},entryPoint:{address:ep,codeHash:epCode && epCode!=="0x"?keccak256(epCode):null,requiredForPurchase:false},compatibilityProven:false});
  mkdirSync("artifacts/m3",{recursive:true});
  writeFileSync("artifacts/m3/network-probes.json",JSON.stringify({schemaVersion:2,recordedAt:new Date().toISOString(),transactionsSubmitted:0,observations},(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");
  console.log(JSON.stringify({chainId:chain,metadataChecked:true,readOnly:spec.readOnly}));
}
mkdirSync("artifacts/m3",{recursive:true});writeFileSync("artifacts/m3/network-probes.json",JSON.stringify({schemaVersion:2,recordedAt:new Date().toISOString(),transactionsSubmitted:0,observations,limitations:["Third-party RPC observations; no independent consensus verification.","Metadata is not ERC-1271 or facilitator settlement proof.","Mainnet remains read-only."]},(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");
