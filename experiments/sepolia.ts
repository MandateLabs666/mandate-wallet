import { mkdirSync,readFileSync,existsSync } from 'node:fs';
import { createPublicClient,http,parseEther,getAddress,keccak256,type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { clients,walletAbi,tokenAbi } from '../packages/core/chain.js';
import { PolicySpec,hashJson,stepId,type Policy,M1Error } from '../packages/core/model.js';
import { PaymentStore } from '../packages/core/store.js';
import { DurablePending,makeFacilitator } from '../packages/core/facilitator.js';
import { startMerchant } from '../packages/core/merchant.js';
import { MandateClient } from '../packages/core/client.js';
import { readTestKey,deploy,grant,writeEvidence } from './harness.js';

process.umask(0o077);
const phase=process.argv[2]??'status';
const config=JSON.parse(readFileSync('artifacts/test-accounts.json','utf8'));
if(config.chainId!==84532||config.asset.toLowerCase()!=='0x036cbd53842c5426634e7929541ec2318f3dcf7e')throw new M1Error('TESTNET_CONFIGURATION_INVALID');
const pc=createPublicClient({chain:baseSepolia,transport:http(config.rpcUrl,{timeout:10000,retryCount:0}),pollingInterval:1000});
if(await pc.getChainId()!==84532)throw new M1Error('RPC_CHAIN_MISMATCH');
const ownerAddress=getAddress(config.addresses.owner);const asset=getAddress(config.asset);const operatorAddress=getAddress(config.addresses.operator);
const status={chainId:84532,owner:ownerAddress,ownerETH:(await pc.getBalance({address:ownerAddress})).toString(),ownerUSDC:(await pc.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[ownerAddress]})).toString(),operatorETH:(await pc.getBalance({address:operatorAddress})).toString()};
writeEvidence('artifacts/sepolia-funding.json',status);
const manifestPath='artifacts/sepolia-deployment.json';
type Manifest={schemaVersion:1;chainId:84532;wallet:Hex;asset:Hex;owner:Hex;deploymentTx:Hex;deploymentBlock:string;runtimeCodeHash:Hex;policy:Policy;revocationPolicy:Policy;grants:Hex[];name:string;compiler:string;sourceHash:Hex};
function manifest():Manifest {const m=JSON.parse(readFileSync(manifestPath,'utf8'));if(m.chainId!==84532||m.owner!==ownerAddress||m.asset!==asset)throw new M1Error('MANIFEST_MISMATCH');return m;}
async function runtimeCode(wallet:Hex,block?:bigint):Promise<Hex>{
  for(let i=0;i<20;i++){const code=await pc.getCode({address:wallet,...(block===undefined?{}:{blockNumber:block})});if(code&&code!=='0x')return code;await new Promise(r=>setTimeout(r,500));}
  throw new M1Error('DEPLOYED_CODE_PENDING');
}

if(phase==='status')console.log(JSON.stringify(status));
else if(phase==='setup') {
  // Owner material is loaded only by this initialization phase, never by run/after-revoke.
  const owner=readTestKey('owner');if(owner.address!==ownerAddress)throw new M1Error('OWNER_MISMATCH');const context=clients(84532,config.rpcUrl,owner);
  if(BigInt(status.ownerETH)===0n||BigInt(status.ownerUSDC)<1000000n)throw new M1Error('TEST_FUNDS_NOT_READY');
  mkdirSync('.runtime/sepolia',{recursive:true,mode:0o700});
  let m:Manifest;
  if(existsSync(manifestPath))m=manifest();
  else {
    const broadcastPath='artifacts/sepolia-deploy-broadcast.json';let wallet;
    if(existsSync(broadcastPath)){
      const saved=JSON.parse(readFileSync(broadcastPath,'utf8'));if(saved.owner!==owner.address||saved.asset!==asset||saved.chainId!==84532)throw new M1Error('DEPLOYMENT_RECORD_MISMATCH');
      const receipt=await pc.waitForTransactionReceipt({hash:saved.hash,timeout:60000});if(receipt.status!=='success'||!receipt.contractAddress)throw new M1Error('DEPLOYMENT_FAILED');
      wallet={address:receipt.contractAddress,hash:saved.hash as Hex,block:receipt.blockNumber};
    }else wallet=await deploy(context,'MandateWallet',[owner.address,asset],hash=>writeEvidence(broadcastPath,{chainId:84532,owner:owner.address,asset,hash}));
    const code=await runtimeCode(wallet.address,wallet.block);const block=await pc.getBlock();
    if(await pc.readContract({address:wallet.address,abi:walletAbi,functionName:'owner'})!==owner.address||await pc.readContract({address:wallet.address,abi:walletAbi,functionName:'asset'})!==asset)throw new M1Error('DEPLOYMENT_FIELDS_MISMATCH');
    const basePolicy={schemaVersion:1 as const,owner:owner.address,wallet:wallet.address,chainId:84532,sessionSigner:getAddress(config.addresses.session),asset,payTo:getAddress(config.addresses.merchant),budget:'150000',maxPerPayment:'100000',expiresAt:Number(block.timestamp)+86400,stepIds:[stepId('eth-stats'),stepId('btc-stats')]};
    const policy=PolicySpec.parse({...basePolicy,mandateId:hashJson({wallet:wallet.address,case:'normal'})});
    const revocationPolicy=PolicySpec.parse({...basePolicy,mandateId:hashJson({wallet:wallet.address,case:'revocation'})});
    m={schemaVersion:1,chainId:84532,wallet:wallet.address,asset,owner:owner.address,deploymentTx:wallet.hash,deploymentBlock:wallet.block.toString(),runtimeCodeHash:keccak256(code),policy,revocationPolicy,grants:[],name:await pc.readContract({address:asset,abi:tokenAbi,functionName:'name'}),compiler:'solc 0.8.26; optimizer 200; viaIR; cancun',sourceHash:hashJson(readFileSync('contracts/src/MandateWallet.sol','utf8'))};
    writeEvidence(manifestPath,m);
  }
  if(keccak256(await runtimeCode(m.wallet))!==m.runtimeCodeHash)throw new M1Error('DEPLOYED_CODE_MISMATCH');
  const walletBalance=await pc.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[m.wallet]});
  if(walletBalance<1000000n){const hash=await context.wc.writeContract({address:asset,abi:tokenAbi,functionName:'transfer',args:[m.wallet,1000000n-walletBalance]});await pc.waitForTransactionReceipt({hash,confirmations:2,timeout:60000});}
  if(BigInt(status.operatorETH)<parseEther('0.0002')){const hash=await context.wc.sendTransaction({to:operatorAddress,value:parseEther('0.0002')-BigInt(status.operatorETH)});await pc.waitForTransactionReceipt({hash,confirmations:2,timeout:60000});}
  for(const p of [m.policy,m.revocationPolicy]){const current=await pc.readContract({address:m.wallet,abi:walletAbi,functionName:'getMandate',args:[p.mandateId]});if(!current.exists)m.grants.push(await grant(context,p));}
  writeEvidence(manifestPath,m);console.log(JSON.stringify({phase,wallet:m.wallet,manifest:manifestPath}));
} else if(phase==='run'||phase==='after-revoke') {
  const m=manifest();const session=readTestKey('session');const operator=readTestKey('operator');
  if(session.address!==config.addresses.session||operator.address!==operatorAddress||session.address===ownerAddress||operator.address===ownerAddress)throw new M1Error('ROLE_MISMATCH');
  const context=clients(84532,config.rpcUrl,operator);mkdirSync('.runtime/sepolia',{recursive:true,mode:0o700});
  const store=new PaymentStore('.runtime/sepolia/client.sqlite');const pending=new DurablePending('.runtime/sepolia/facilitator.sqlite');const facilitator=makeFacilitator(context,pending);
  const merchant=await startMerchant({facilitator,chainId:84532,asset:m.asset,payTo:m.policy.payTo,dbPath:'.runtime/sepolia/merchant.sqlite',port:9010,domainName:m.name});
  const urls={'eth-stats':`${merchant.origin}/stats?asset=ETH`,'btc-stats':`${merchant.origin}/stats?asset=BTC`};
  const normal=new MandateClient(m.policy,context,session,store,urls,BigInt(m.deploymentBlock),2);
  const revocation=new MandateClient(m.revocationPolicy,context,session,store,urls,BigInt(m.deploymentBlock),2);
  try {
    if(phase==='run') {
      let r=await normal.purchaseStep('eth-stats');if(r.paymentState==='registering'||r.serviceState!=='returned')r=await normal.purchaseStep('eth-stats');
      for(let i=0;r.paymentState==='pending'&&i<30;i++){await new Promise(resolve=>setTimeout(resolve,1000));r=await normal.reconcilePayment(r);}
      if(r.paymentState!=='settled'||r.resultState!=='valid')throw new M1Error(r.errorCode??'PUBLIC_PAYMENT_NOT_CONFIRMED');
      const repeat=await normal.purchaseStep('eth-stats');if(repeat.nonce!==r.nonce)throw new M1Error('DUPLICATE_NONCE');
      let budgetRejected=false;try{await normal.prepareStep('btc-stats');}catch{budgetRejected=store.get(normal.key(stepId('btc-stats')))?.errorCode==='BudgetExceeded';}
      if(!budgetRejected)throw new M1Error('PUBLIC_BUDGET_REJECTION_UNVERIFIED');
      const prepared=await revocation.prepareStep('eth-stats');const verified=await facilitator.verify(prepared.payload,prepared.requirements);if(!verified.isValid)throw new M1Error('PREVERIFY_FAILED');
      writeEvidence('artifacts/sepolia-preverify.json',{environment:'BASE_SEPOLIA_NATIVE_USDC',record:prepared,verified:{isValid:verified.isValid,payer:verified.payer},beforeRevokeBalance:(await pc.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[m.policy.payTo]})).toString()});
      writeEvidence('artifacts/sepolia-payment.json',{environment:'BASE_SEPOLIA_NATIVE_USDC',...normal.exportEvidence(),checks:{sameNonceOnRetry:true,budgetRejected},confirmationPolicy:'2 blocks; reorgs remain possible'});
      console.log(JSON.stringify({phase,settlement:r.settlementTx,paymentState:r.paymentState,resultState:r.resultState,budgetRejected,next:'owner phase: revoke; then after-revoke'}));
    }else {
      const previous=JSON.parse(readFileSync('artifacts/sepolia-preverify.json','utf8'));const record=store.get(previous.record.key);if(!record)throw new M1Error('PREVERIFIED_RECORD_MISSING');
      if(!(await pc.readContract({address:m.wallet,abi:walletAbi,functionName:'getMandate',args:[m.revocationPolicy.mandateId]})).revoked)throw new M1Error('OWNER_REVOCATION_REQUIRED');
      const settled=await facilitator.settle(record.payload,record.requirements);if(settled.success)throw new M1Error('REVOKED_PAYMENT_ACCEPTED');
      const a=record.payload.payload.authorization as {from:Hex;to:Hex;value:string;validAfter:string;validBefore:string;nonce:Hex};
      // Explicit gas submits a negative test transaction instead of stopping at simulation.
      const tx=await context.wc.writeContract({address:asset,abi:tokenAbi,functionName:'transferWithAuthorization',args:[a.from,a.to,BigInt(a.value),BigInt(a.validAfter),BigInt(a.validBefore),a.nonce,record.payload.payload.signature as Hex],gas:350000n});
      const receipt=await pc.waitForTransactionReceipt({hash:tx,confirmations:2,timeout:60000});
      const balance=(await pc.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[m.policy.payTo]})).toString();
      if(receipt.status!=='reverted'||balance!==previous.beforeRevokeBalance)throw new M1Error('REVOKED_TRANSFER_NOT_REJECTED');
      const now=(await pc.getBlock()).timestamp;const wasStillWithinWindow=now<BigInt(a.validBefore);
      writeEvidence('artifacts/sepolia-revocation.json',{environment:'BASE_SEPOLIA_NATIVE_USDC',preverified:true,revoked:true,withinPaymentWindow:wasStillWithinWindow,settleReason:settled.errorReason,negativeTransaction:tx,receiptStatus:receipt.status,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,balanceUnchanged:true,occupied:(await pc.readContract({address:m.wallet,abi:walletAbi,functionName:'getMandate',args:[m.revocationPolicy.mandateId]})).occupied.toString()});
      if(!wasStillWithinWindow)throw new M1Error('REVOKE_EXPERIMENT_EXPIRED_REPEAT_WITH_FRESH_OWNER_AUTHORIZATION');
      console.log(JSON.stringify({phase,revertedTransaction:tx,balanceUnchanged:true,withinPaymentWindow:true}));
    }
  }finally{await merchant.close();store.close();pending.close();}
} else if(phase==='revoke') {
  const m=manifest();const owner=readTestKey('owner');if(owner.address!==m.owner)throw new M1Error('OWNER_MISMATCH');const context=clients(84532,config.rpcUrl,owner);
  const hash=await context.wc.writeContract({address:m.wallet,abi:walletAbi,functionName:'revokeMandate',args:[m.revocationPolicy.mandateId]});const receipt=await context.pc.waitForTransactionReceipt({hash,confirmations:2,timeout:60000});if(receipt.status!=='success')throw new M1Error('REVOCATION_FAILED');
  writeEvidence('artifacts/sepolia-revoke-owner.json',{transaction:hash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash});console.log(JSON.stringify({phase,transaction:hash}));
}else throw new M1Error('PHASE_UNSUPPORTED');
