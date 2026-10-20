import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mnemonicToAccount } from 'viem/accounts';
import { type Abi, type Hex, type LocalAccount } from 'viem';
import { clients, walletAbi, tokenAbi } from '../packages/core/chain.js';
import { hashJson, stepId, type Policy, M1Error } from '../packages/core/model.js';
import { PaymentStore } from '../packages/core/store.js';
import { DurablePending, makeFacilitator } from '../packages/core/facilitator.js';
import { startMerchant } from '../packages/core/merchant.js';
import { MandateClient } from '../packages/core/client.js';

export const TEST_MNEMONIC='test test test test test test test test test test test junk';
export function artifact(name:string) { return JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`,'utf8')) as {abi:Abi;bytecode:{object:Hex}}; }
export async function deploy(context:ReturnType<typeof clients>,name:string,args:unknown[]=[],onBroadcast?:(hash:Hex)=>void):Promise<{address:Hex;hash:Hex;block:bigint}> {
  const a=artifact(name);const hash=await context.wc.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});
  onBroadcast?.(hash);
  const r=await context.pc.waitForTransactionReceipt({hash,timeout:15000});
  if(r.status!=='success'||!r.contractAddress) throw new M1Error('DEPLOYMENT_FAILED');
  return {address:r.contractAddress,hash,block:r.blockNumber};
}
export async function grant(context:ReturnType<typeof clients>,policy:Policy) {
  const hash=await context.wc.writeContract({address:policy.wallet,abi:walletAbi,functionName:'createMandate',args:[policy.mandateId,policy.sessionSigner,policy.payTo,BigInt(policy.budget),BigInt(policy.maxPerPayment),BigInt(policy.expiresAt),policy.stepIds]});
  const r=await context.pc.waitForTransactionReceipt({hash,timeout:15000});if(r.status!=='success')throw new M1Error('GRANT_FAILED');return hash;
}
export async function startAnvil() {
  const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const a=s.address();if(!a||typeof a==='string')throw new Error('BIND_FAILED');const port=a.port;await new Promise<void>(r=>s.close(()=>r()));
  const proc=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','prague','--silent','--mnemonic',TEST_MNEMONIC],{stdio:'ignore'});
  const rpc=`http://127.0.0.1:${port}`;const owner=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:0});const context=clients(31337,rpc,owner);
  for(let i=0;i<80;i++) {if(proc.exitCode!==null)throw new Error('ANVIL_EXITED');try{await context.pc.getChainId();return {rpc,stop:()=>proc.kill('SIGTERM')};}catch{await new Promise(r=>setTimeout(r,50));}}
  proc.kill();throw new Error('ANVIL_START_FAILED');
}
export async function localFixture(options:{failAfterPayment?:boolean}={}) {
  process.umask(0o077);
  const node=await startAnvil();const owner=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:0});const session=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:1});const operator=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:2});const merchantAccount=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:3});
  const ownerContext=clients(31337,node.rpc,owner);const operatorContext=clients(31337,node.rpc,operator);
  const dir=`.runtime/local-${Date.now()}-${Math.random().toString(16).slice(2)}`;mkdirSync(dir,{recursive:true,mode:0o700});
  const token=await deploy(ownerContext,'MockUSDC');const wallet=await deploy(ownerContext,'MandateWallet',[owner.address,token.address]);
  const minted=await ownerContext.wc.writeContract({address:token.address,abi:tokenAbi,functionName:'mint',args:[wallet.address,1000000n]});await ownerContext.pc.waitForTransactionReceipt({hash:minted});
  const store=new PaymentStore(`${dir}/client.sqlite`);const pending=new DurablePending(`${dir}/facilitator.sqlite`);const facilitator=makeFacilitator(operatorContext,pending);
  const merchant=await startMerchant({facilitator,chainId:31337,asset:token.address,payTo:merchantAccount.address,dbPath:`${dir}/merchant.sqlite`,...options});
  const policy:Policy={schemaVersion:1,mandateId:hashJson({dir,task:'stats'}),owner:owner.address,wallet:wallet.address,chainId:31337,sessionSigner:session.address,asset:token.address,payTo:merchantAccount.address,budget:'150000',maxPerPayment:'100000',expiresAt:Number((await ownerContext.pc.getBlock()).timestamp)+3600,stepIds:[stepId('eth-stats'),stepId('btc-stats')]};
  await grant(ownerContext,policy);
  const urls={'eth-stats':`${merchant.origin}/stats?asset=ETH`,'btc-stats':`${merchant.origin}/stats?asset=BTC`};
  const client=new MandateClient(policy,operatorContext,session,store,urls,wallet.block);
  return {dir,node,owner,session,operator,ownerContext,operatorContext,merchant,facilitator,pending,policy,client,store,urls,wallet,token,
    close:async()=>{await merchant.close();store.close();pending.close();node.stop();}};
}
export function readTestKey(role:'owner'|'session'|'operator'):LocalAccount {
  return (requireKey(role));
}
import { privateKeyToAccount } from 'viem/accounts';
function requireKey(role:string) { const data=JSON.parse(readFileSync(`.runtime/keys/${role}.json`,'utf8'));return privateKeyToAccount(data.privateKey); }
export function writeEvidence(path:string,data:unknown) {mkdirSync('artifacts',{recursive:true});writeFileSync(path,JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}
