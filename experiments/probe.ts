import { createPublicClient,http,keccak256,toBytes,getAddress,zeroAddress,type Hex } from 'viem';
import { base,baseSepolia } from 'viem/chains';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { tokenAbi } from '../packages/core/chain.js';
import { writeEvidence } from './harness.js';
import { decodePaymentRequiredHeader } from '@x402/core/http';

const specs=[
  {chain:baseSepolia,rpc:'https://sepolia.base.org',asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e',explorer:'https://base-sepolia.blockscout.com'},
  {chain:base,rpc:'https://mainnet.base.org',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',explorer:'https://base.blockscout.com'},
] as const;
const EIP1967='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;
const legacySlot=keccak256(toBytes('org.zeppelinos.proxy.implementation'));
async function boundedJson(response:Response) {
  if(!response.body)throw new Error('EMPTY_BODY');const reader=response.body.getReader();let length=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2000000){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function inspectAsset(spec:typeof specs[number]) {
  const pc=createPublicClient({chain:spec.chain,transport:http(spec.rpc,{timeout:10000,retryCount:0})});const asset=getAddress(spec.asset);
  if(await pc.getChainId()!==spec.chain.id)throw new Error('RPC_CHAIN_MISMATCH');const block=await pc.getBlock();const code=await pc.getCode({address:asset});
  const storage=await Promise.all([EIP1967,legacySlot].map(slot=>pc.getStorageAt({address:asset,slot,blockNumber:block.number})));
  const implementation=storage.map(x=>x&&getAddress('0x'+x.slice(-40))).find(x=>x&&x!==zeroAddress);
  if(!implementation)throw new Error('IMPLEMENTATION_NOT_RESOLVED');
  const [name,version,decimals,domainSeparator,implCode]=await Promise.all([
    pc.readContract({address:asset,abi:tokenAbi,functionName:'name',blockNumber:block.number}),pc.readContract({address:asset,abi:tokenAbi,functionName:'version',blockNumber:block.number}),
    pc.readContract({address:asset,abi:tokenAbi,functionName:'decimals',blockNumber:block.number}),pc.readContract({address:asset,abi:tokenAbi,functionName:'DOMAIN_SEPARATOR',blockNumber:block.number}),pc.getCode({address:implementation,blockNumber:block.number}),
  ]);
  let sourceEvidence:unknown={verified:false};
  try{
    let sourceUrl=`${spec.explorer}/api/v2/smart-contracts/${implementation}`;let metadata;
    try{const r=await fetch(sourceUrl,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('SOURCE_UNAVAILABLE');metadata=await boundedJson(r);}
    catch(error){if(spec.chain.id!==8453)throw error;sourceUrl=`https://basescan.org/address/${implementation}`;const r=await fetch(sourceUrl,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw error;const html=await r.text();if(html.length>2000000)throw new Error('BODY_TOO_LARGE');metadata=JSON.parse(execFileSync('python3',['scripts/parse-explorer-source.py'],{input:html,maxBuffer:3000000}).toString());}
    const sources=[{file_path:metadata.file_path,source_code:metadata.source_code},...(metadata.additional_sources??[])];
    const text=sources.map((s:{source_code?:string})=>s.source_code??'').join('\n');
    mkdirSync('artifacts/usdc-sources',{recursive:true});writeFileSync(`artifacts/usdc-sources/${spec.chain.id}.json`,JSON.stringify({implementation,sourceUrl,name:metadata.name,isVerified:metadata.is_verified,sources},null,2)+'\n');
    sourceEvidence={verified:metadata.is_verified===true,contractName:metadata.name,hasSignatureChecker:text.includes('SignatureChecker'),has1271:text.includes('isValidSignature'),hasBytesAuthorizationOverload:/transferWithAuthorization[\s\S]{0,1600}bytes/.test(text),sourceHash:keccak256(toBytes(text)),file:`artifacts/usdc-sources/${spec.chain.id}.json`};
  }catch{sourceEvidence={verified:false,code:'EXPLORER_SOURCE_UNAVAILABLE'};}
  let balance:unknown;
  if(spec.chain.id===84532){const accounts=JSON.parse(readFileSync('artifacts/test-accounts.json','utf8'));balance={owner:accounts.addresses.owner,eth:(await pc.getBalance({address:accounts.addresses.owner})).toString(),usdc:(await pc.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[accounts.addresses.owner]})).toString()};}
  return {chainId:spec.chain.id,asset,blockNumber:block.number.toString(),blockHash:block.hash,implementation,proxyCodeHash:keccak256(code!),implementationCodeHash:keccak256(implCode!),name,version,decimals,domainSeparator,sourceEvidence,balance,mode:'READ_ONLY'};
}
function privateIp(ip:string):boolean {
  if(ip.includes(':'))return /^(::|::1|fc|fd|fe8|fe9|fea|feb|::ffff:)/i.test(ip);
  const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224||a===100&&b>=64&&b<=127;
}
async function safeProbe(url:string) {
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||isIP(u.hostname))throw new Error('URL_REJECTED');
  const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>privateIp(a.address)))throw new Error('PRIVATE_ENDPOINT_REJECTED');
  const r=await fetch(u,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)});
  const h=r.headers.get('payment-required');const required=h?decodePaymentRequiredHeader(h):undefined;
  await r.body?.cancel();return {url,status:r.status,redirect:r.headers.get('location'),x402Version:required?.x402Version,accepts:required?.accepts,resource:required?.resource,extensions:required?.extensions?Object.keys(required.extensions):[]};
}
async function bazaar() {
  const url='https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0';
  const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)return {url,status:r.status,candidates:[],code:'CATALOG_UNAVAILABLE'};
  const data=await boundedJson(r);const items=(data.items??[]) as Array<{resource:string;description?:string;type?:string;x402Version?:number;accepts?:Array<{network:string;asset:string;scheme:string}>;extensions?:Record<string,unknown>}>;
  const candidates=items.filter(i=>i.type==='http'&&i.x402Version===2&&i.accepts?.some(a=>['eip155:8453','eip155:84532'].includes(a.network)&&a.scheme==='exact'&&specs.some(s=>s.asset.toLowerCase()===a.asset.toLowerCase()))).slice(0,5);
  const probes=[];
  for(const item of candidates){try{probes.push({...item,endpoint:await safeProbe(item.resource),authorization:'NOT_AUTHORIZED_OR_PURCHASED'});}catch{probes.push({...item,endpoint:{code:'PROBE_UNAVAILABLE'},authorization:'NOT_AUTHORIZED_OR_PURCHASED'});}}
  return {url,status:r.status,pagination:data.pagination,catalogCount:items.length,candidates:probes,mode:'DISCOVERY_AND_UNSIGNED_GET_ONLY',limitations:['first page only','missing query arguments may return 400','directory is not authorization','no DNS rebinding guarantee for this experimental probe']};
}
const results=[];
for(const spec of specs){try{results.push(await inspectAsset(spec));}catch{results.push({chainId:spec.chain.id,mode:'READ_ONLY',code:'ASSET_INSPECTION_UNAVAILABLE'});}}
let discovery:unknown;try{discovery=await bazaar();}catch{discovery={code:'CATALOG_UNAVAILABLE'};}
writeEvidence('artifacts/public-probes.json',{timestamp:new Date().toISOString(),assets:results,bazaar:discovery});
console.log(JSON.stringify({evidence:'artifacts/public-probes.json',assets:results.map(r=>({chainId:r.chainId,mode:r.mode})),bazaarStatus:(discovery as {status?:number}).status}));
