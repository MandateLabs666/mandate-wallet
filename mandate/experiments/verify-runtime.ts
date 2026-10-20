// Local source checks plus public bytecode reads. No source upload, signing or transaction broadcast.
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,relative} from "node:path";
import {createPublicClient,http,keccak256,encodeFunctionData,encodeAbiParameters,concatHex,getContractAddress,isAddressEqual,type Address,type Hex} from "viem";
import {factoryAbi} from "../sdk/factoryAbi.js";
import {materializeRuntime,domainSeparator} from "./runtime-match.js";
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8")),identifiers=JSON.parse(readFileSync("artifacts/m3/immutable-identifiers.json","utf8"));
const root=resolve("."),results=[];
for(const chainId of [11155111,84532]) {
  const spec=settings.networks.find((s:{chainId:number})=>s.chainId===chainId),manifest=JSON.parse(readFileSync(`artifacts/m3/${chainId}-deployment.json`,"utf8")),config=JSON.parse(readFileSync(`.runtime/m3/${chainId}-config.json`,"utf8"));
  const pc=createPublicClient({transport:http(spec.rpc,{timeout:20000,retryCount:0})}),witness=createPublicClient({transport:http(spec.witnessRpc,{timeout:20000,retryCount:0})});
  if(await pc.getChainId()!==chainId || await witness.getChainId()!==chainId)throw new Error("CHAIN_MISMATCH");
  for(const [name,record] of Object.entries(manifest.contracts) as [string,{address:Address;hash:Hex;owner?:Address;asset?:Address;factory?:Address;salt?:Hex}][]) {
    const artifact=JSON.parse(readFileSync(`mandate/contracts/out/${name}.sol/${name}.json`,"utf8"));
    const sourceChecks=[];
    for(const [source,metadata] of Object.entries(artifact.metadata.sources) as [string,{keccak256:Hex}][]) {
      const path=resolve("mandate/contracts",source);
      if(relative(root,path).startsWith(".."))throw new Error("UNEXPECTED_SOURCE_PATH");
      const hash=keccak256(readFileSync(path));if(hash!==metadata.keccak256)throw new Error("SOURCE_HASH_MISMATCH");sourceChecks.push({source,keccak256:hash});
    }
    const token=domainSeparator(config.tokenDomain.name,config.tokenDomain.version,chainId,config.asset);
    const expected=materializeRuntime(artifact,identifiers[name],{chainId,address:record.address,owner:record.owner,asset:record.asset,tokenDomain:name==="TestUSDC"?domainSeparator("USDC","2",chainId,record.address):token});
    const primary=await pc.getCode({address:record.address}),secondary=await witness.getCode({address:record.address});
    if(primary!==expected || secondary!==expected)throw new Error("FULL_RUNTIME_MISMATCH:"+chainId+":"+name);
    const tx=await pc.getTransaction({hash:record.hash}),other=await witness.getTransaction({hash:record.hash});
    if(tx.input!==other.input || tx.from!==other.from || tx.to!==other.to)throw new Error("CREATION_TRANSACTION_SOURCES_DISAGREE");
    let creationMatch=false;
    if(name==="MandateAccount") {
      if(!record.owner || !record.asset || !record.salt || !record.factory)throw new Error("CONSTRUCTOR_CONTEXT_MISSING");
      const calldata=encodeFunctionData({abi:factoryAbi,functionName:"createAccount",args:[record.asset,record.salt]});
      const salt=keccak256(encodeAbiParameters([{type:"address"},{type:"address"},{type:"bytes32"}],[record.owner,record.asset,record.salt]));
      const bytecode=concatHex([artifact.bytecode.object,encodeAbiParameters([{type:"address"},{type:"address"}],[record.owner,record.asset])]);
      const predicted=getContractAddress({opcode:"CREATE2",from:record.factory,salt,bytecode});
      creationMatch=tx.input===calldata && !!tx.to && isAddressEqual(tx.to,record.factory) && isAddressEqual(tx.from,record.owner) && isAddressEqual(predicted,record.address);
    } else creationMatch=tx.to===null && tx.input===artifact.bytecode.object;
    if(!creationMatch)throw new Error("CREATION_CONTEXT_MISMATCH");
    results.push({chainId,name,address:record.address,sourceCommit:manifest.sourceCommit,creationTransactionHash:record.hash,creationMatch,fullRuntimeMatch:true,witnessRuntimeMatch:true,
      runtimeHash:keccak256(expected),immutableCount:Object.keys(artifact.deployedBytecode.immutableReferences??{}).length,sourceChecks,compiler:artifact.metadata.compiler.version,method:"local compiler artifact + all constructor immutables reconstructed + exact two-RPC bytecode equality"});
    console.log(JSON.stringify({chainId,name,fullRuntimeMatch:true,creationMatch:true}));
  }
}
writeFileSync("artifacts/m3/runtime-verification.json",JSON.stringify({schemaVersion:2,recordedAt:new Date().toISOString(),publishedSources:false,transactionsSubmitted:0,results,limitations:["No Sourcify public verification claimed; publication awaits explicit authorization.","Third-party RPC trust and short-term chain observations; finality and later proxy changes remain separate conditions."]},null,2)+"\n");
