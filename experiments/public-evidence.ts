import {readFileSync} from 'node:fs';
import {hashTypedData,parseEventLogs,type Hex} from 'viem';
import {clients,walletAbi,tokenAbi,authorizationTypes} from '../packages/core/chain.js';
import {hashJson,M1Error} from '../packages/core/model.js';
import {PaymentStore} from '../packages/core/store.js';
import {DurablePending,makeFacilitator} from '../packages/core/facilitator.js';
import {MandateClient} from '../packages/core/client.js';
import {readTestKey,writeEvidence} from './harness.js';

process.umask(0o077);
const config=JSON.parse(readFileSync('artifacts/test-accounts.json','utf8'));
const m=JSON.parse(readFileSync('artifacts/sepolia-deployment.json','utf8'));
if(config.chainId!==84532||m.chainId!==84532)throw new M1Error('TEST_NETWORK_REQUIRED');
const context=clients(84532,config.rpcUrl,readTestKey('operator'));const {pc}=context;
if(await pc.getChainId()!==84532)throw new M1Error('RPC_CHAIN_MISMATCH');
const store=new PaymentStore('.runtime/sepolia/client.sqlite');const pending=new DurablePending('.runtime/sepolia/facilitator.sqlite');
try {
  const client=new MandateClient(m.policy,context,readTestKey('session'),store,{},BigInt(m.deploymentBlock),2);
  const payment=store.all().find(r=>r.mandateId===m.policy.mandateId&&r.settlementTx)!;
  if(!payment)throw new M1Error('SETTLEMENT_MISSING');
  const reconciled=await client.reconcilePayment(payment);
  if(reconciled.paymentState!=='settled')throw new M1Error('SETTLEMENT_UNCONFIRMED');
  const receipt=await pc.getTransactionReceipt({hash:payment.settlementTx!});
  const before=receipt.blockNumber-1n;const after=receipt.blockNumber;
  const balance=async(address:Hex,blockNumber:bigint)=>(await pc.readContract({address:m.asset,abi:tokenAbi,functionName:'balanceOf',args:[address],blockNumber})).toString();
  const balances={walletBefore:await balance(m.wallet,before),walletAfter:await balance(m.wallet,after),merchantBefore:await balance(m.policy.payTo,before),merchantAfter:await balance(m.policy.payTo,after)};
  const amount=BigInt(payment.requirements.amount);
  if(BigInt(balances.walletBefore)-BigInt(balances.walletAfter)!==amount||BigInt(balances.merchantAfter)-BigInt(balances.merchantBefore)!==amount)throw new M1Error('BALANCE_DELTA_MISMATCH');
  const tokenLogs=receipt.logs.filter(l=>l.address.toLowerCase()===m.asset.toLowerCase());
  const events={authorizationUsed:parseEventLogs({abi:tokenAbi,eventName:'AuthorizationUsed',logs:tokenLogs}),transfer:parseEventLogs({abi:tokenAbi,eventName:'Transfer',logs:tokenLogs})};
  const negative=JSON.parse(readFileSync('artifacts/sepolia-revocation.json','utf8'));
  const prepared=JSON.parse(readFileSync('artifacts/sepolia-preverify.json','utf8'));
  const nr=await pc.getTransactionReceipt({hash:negative.negativeTransaction});const nb=await pc.getBlock({blockNumber:nr.blockNumber});
  if(nr.status!=='reverted'||!nb.hash||/^0x0+$/.test(nb.hash)||nr.blockHash!==nb.hash||nb.timestamp>=BigInt(prepared.record.payload.payload.authorization.validBefore))throw new M1Error('REVOCATION_RECEIPT_UNCONFIRMED');
  writeEvidence('artifacts/sepolia-revocation.json',{...negative,blockHash:nr.blockHash,blockTimestamp:nb.timestamp.toString(),gasUsed:nr.gasUsed.toString(),effectiveGasPrice:nr.effectiveGasPrice.toString(),withinPaymentWindow:true});
  // Deliberately sign an unregistered digest to test a hostile session signer.
  // This bypass is confined to this negative experiment, never the procurement client.
  const now=(await pc.getBlock()).timestamp;
  const authorization={from:m.wallet,to:m.policy.payTo,value:'100000',validAfter:'0',validBefore:(now+120n).toString(),nonce:hashJson({case:'UNREGISTERED_NEGATIVE_TEST',wallet:m.wallet})};
  const typed={domain:{name:m.name,version:'2',chainId:84532,verifyingContract:m.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization' as const,message:{...authorization,value:100000n,validAfter:0n,validBefore:now+120n}};
  const digest=hashTypedData(typed);const signature=await readTestKey('session').signTypedData(typed);
  const unregistered=!(await pc.readContract({address:m.wallet,abi:walletAbi,functionName:'getCommitment',args:[digest]})).exists;
  const magic=await pc.readContract({address:m.wallet,abi:walletAbi,functionName:'isValidSignature',args:[digest,signature]});
  const payload={...payment.payload,payload:{authorization,signature}};
  const verify=await makeFacilitator(context,pending).verify(payload,payment.requirements);
  let tokenRejected=false;try{await pc.simulateContract({address:m.asset,abi:tokenAbi,functionName:'transferWithAuthorization',args:[authorization.from,authorization.to,100000n,0n,now+120n,authorization.nonce,signature]});}catch(error){if((error as {name:string}).name==='ContractFunctionExecutionError'&&(error as {cause?:{name:string}}).cause?.name==='ContractFunctionRevertedError')tokenRejected=true;else throw error;}
  if(!unregistered||magic!=='0xffffffff'||verify.isValid||!tokenRejected)throw new M1Error('UNREGISTERED_REJECTION_UNVERIFIED');
  writeEvidence('artifacts/sepolia-unregistered.json',{environment:'BASE_SEPOLIA_NATIVE_USDC',digest,authorization,signature,unregistered,magic,facilitatorValid:verify.isValid,reason:verify.invalidReason,tokenSimulationRejected:tokenRejected,validation:'live ERC-1271 and native USDC eth_call; no transaction submitted'});
  const ownerRevoke=JSON.parse(readFileSync('artifacts/sepolia-revoke-owner.json','utf8'));
  const transactions=[{purpose:'deploy',hash:m.deploymentTx},...m.grants.map((hash:Hex)=>({purpose:'create_mandate',hash})),...store.all().filter(r=>r.registrationTx).map(r=>({purpose:'register_payment',hash:r.registrationTx!})),{purpose:'settle',hash:receipt.transactionHash},{purpose:'revoke',hash:ownerRevoke.transaction},{purpose:'negative_settlement',hash:nr.transactionHash}];
  const gasLedger=[];
  for(const item of transactions){const r=await pc.getTransactionReceipt({hash:item.hash});const raw=await pc.request({method:'eth_getTransactionReceipt',params:[item.hash]}) as unknown as {l1Fee?:Hex;operatorFeeScalar?:Hex;operatorFeeConstant?:Hex};gasLedger.push({...item,payer:r.from,status:r.status,gasUsed:r.gasUsed.toString(),effectiveGasPrice:r.effectiveGasPrice.toString(),executionFeeWei:(r.gasUsed*r.effectiveGasPrice).toString(),l1FeeWei:raw.l1Fee?BigInt(raw.l1Fee).toString():null,operatorFeeScalar:raw.operatorFeeScalar??null,operatorFeeConstant:raw.operatorFeeConstant??null});}
  writeEvidence('artifacts/sepolia-gas-ledger.json',{chainId:84532,currency:'test ETH',excludesUSDCBudget:true,scope:'protocol experiment transactions; faucet and bridge preparation separate',serviceFeeUSDCAtomic:'100000',protocolFeeUSDCAtomic:'0',gasLedger,limitation:'executionFeeWei is gasUsed * effectiveGasPrice; OP additional fee fields recorded separately when RPC provides them'});
  writeEvidence('artifacts/sepolia-payment.json',{environment:'BASE_SEPOLIA_NATIVE_USDC',...client.exportEvidence(),checks:{sameNonceOnRetry:true,budgetRejected:true},balances,events,receipt:{transactionHash:receipt.transactionHash,status:receipt.status,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString()},confirmationPolicy:'2 blocks; canonical blockHash checked; reorgs remain possible'});
  console.log(JSON.stringify({balances,unregisteredRejected:true,revocationCanonicalHash:nr.blockHash,evidence:'artifacts/sepolia-payment.json'}));
}finally{store.close();pending.close();}
