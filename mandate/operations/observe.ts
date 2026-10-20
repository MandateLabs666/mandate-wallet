// Read-only observation. No wallet client, signer, key file, or broadcast method.
import {createPublicClient,http,keccak256,isAddressEqual,type Address,type Hex} from "viem";
import {accountAbi} from "../sdk/accountAbi.js";
import {tokenReadAbi} from "../sdk/reader.js";

export type ObservationTarget={chainId:number;rpcs:[string,string];wallet:Address;owner:Address;asset:Address;runtimeHash:Hex;mandateId?:Hex;sessionId?:Hex};
export function authorityIssues(input:{timestamp:bigint;cash:bigint;policy?:{exists:boolean;revoked:boolean;paused:boolean;expiresAt:bigint;budget:bigint;occupied:bigint;version:bigint};session?:{exists:boolean;revoked:boolean;expiresAt:bigint;policyVersion:bigint;budget:bigint;occupied:bigint}}){
  const issues:string[]=[];
  if(input.cash===0n)issues.push("WALLET_ASSET_BALANCE_ZERO");
  const p=input.policy,s=input.session;
  if(p){
    if(!p.exists)issues.push("POLICY_MISSING");
    else {
      if(p.revoked)issues.push("POLICY_REVOKED");if(p.paused)issues.push("POLICY_PAUSED");
      if(BigInt(p.expiresAt)<=input.timestamp)issues.push("POLICY_EXPIRED");
      if(p.occupied>p.budget)issues.push("POLICY_ACCOUNTING_INVARIANT_BROKEN");
      else if(p.occupied===p.budget)issues.push("POLICY_BUDGET_EXHAUSTED");
    }
  }
  if(s){
    if(!s.exists)issues.push("SESSION_MISSING");
    else {
      if(s.revoked)issues.push("SESSION_REVOKED");
      if(BigInt(s.expiresAt)<=input.timestamp)issues.push("SESSION_EXPIRED");
      if(p&&s.policyVersion!==p.version)issues.push("SESSION_POLICY_VERSION_STALE");
      if(s.occupied>s.budget)issues.push("SESSION_ACCOUNTING_INVARIANT_BROKEN");
      else if(s.occupied===s.budget)issues.push("SESSION_BUDGET_EXHAUSTED");
    }
  }
  return issues;
}
export async function observeTarget(target:ObservationTarget){
  if(![84532,11155111].includes(target.chainId))throw new Error("OBSERVATION_TESTNET_ONLY");
  if(target.rpcs[0]===target.rpcs[1])throw new Error("DISTINCT_RPC_SOURCES_REQUIRED");
  for(const endpoint of target.rpcs){const url=new URL(endpoint);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("PUBLIC_HTTPS_RPC_REQUIRED");}
  const clients=target.rpcs.map(url=>createPublicClient({transport:http(url,{timeout:15000,retryCount:0})}));
  const chains=await Promise.all(clients.map(pc=>pc.getChainId()));
  if(chains.some(id=>id!==target.chainId))throw new Error("RPC_CHAIN_MISMATCH");
  const finalized=await Promise.all(clients.map(pc=>pc.getBlock({blockTag:"finalized"})));
  const height=finalized.reduce((h,b)=>b.number!<h?b.number!:h,finalized[0].number!);
  const observations=await Promise.all(clients.map(async(pc,index)=>{
    const block=await pc.getBlock({blockNumber:height}),read={address:target.wallet,abi:accountAbi,blockNumber:height};
    const [code,owner,asset,declaredChain,domain,cash,decimals,nativeBalance,policy,session]=await Promise.all([
      pc.getCode({address:target.wallet,blockNumber:height}),
      pc.readContract({...read,functionName:"owner"}),pc.readContract({...read,functionName:"asset"}),
      pc.readContract({...read,functionName:"deploymentChainId"}),pc.readContract({...read,functionName:"tokenDomain"}),
      pc.readContract({address:target.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[target.wallet],blockNumber:height}),
      pc.readContract({address:target.asset,abi:tokenReadAbi,functionName:"decimals",blockNumber:height}),
      pc.getBalance({address:target.wallet,blockNumber:height}),
      target.mandateId?pc.readContract({...read,functionName:"getPolicy",args:[target.mandateId]}):undefined,
      target.mandateId&&target.sessionId?pc.readContract({...read,functionName:"getSession",args:[target.mandateId,target.sessionId]}):undefined,
    ]);
    if(!code||code==="0x"||keccak256(code)!==target.runtimeHash)throw new Error("PINNED_RUNTIME_MISMATCH");
    if(!isAddressEqual(owner,target.owner)||!isAddressEqual(asset,target.asset)||declaredChain!==BigInt(target.chainId)||decimals!==6)throw new Error("PINNED_ACCOUNT_CONTEXT_MISMATCH");
    const assetDomain=await pc.readContract({address:asset,abi:tokenReadAbi,functionName:"DOMAIN_SEPARATOR",blockNumber:height});
    if(assetDomain!==domain)throw new Error("TOKEN_DOMAIN_CHANGED");
    if((await pc.getBlock({blockNumber:height})).hash!==block.hash)throw new Error("ANCHOR_CHANGED_DURING_READ");
    return {rpc:target.rpcs[index],blockNumber:height,blockHash:block.hash,timestamp:block.timestamp,runtimeHash:keccak256(code),owner,asset,tokenDomain:domain,decimals,cash,nativeBalance,policy,session};
  }));
  // Compare every state field; only the endpoint label differs.
  const canonical=(o:typeof observations[number])=>JSON.stringify({...o,rpc:undefined},(_,v)=>typeof v==="bigint"?v.toString():v);
  if(canonical(observations[0])!==canonical(observations[1]))throw new Error("RPC_STATE_DISAGREEMENT");
  return {chainId:target.chainId,wallet:target.wallet,mandateId:target.mandateId,sessionId:target.sessionId,verified:true,coverage:{account:true,policy:!!target.mandateId,session:!!target.mandateId&&!!target.sessionId,merchantAndStep:false,purchaseReadiness:false},observations,issues:authorityIssues(observations[0]),transactionsSubmitted:0};
}
