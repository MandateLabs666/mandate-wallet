import { readFileSync } from 'node:fs';
import { localFixture,writeEvidence } from './harness.js';
import { tokenAbi,authorizationTypes } from '../packages/core/chain.js';
import { hashJson } from '../packages/core/model.js';
import type { Hex,Abi } from 'viem';
import type { PaymentPayload,PaymentRequirements } from '@x402/core/types';

const e=await localFixture();
try {
  async function legacyDeploy(name:string,args:unknown[]=[]) {
    const a=JSON.parse(readFileSync(`vendor/echo-contracts/out/${name}.sol/${name}.json`,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
    const hash=await e.ownerContext.wc.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});const r=await e.ownerContext.pc.waitForTransactionReceipt({hash});if(!r.contractAddress||r.status!=='success')throw new Error('LEGACY_DEPLOY_FAILED');return r.contractAddress;
  }
  const registry=await legacyDeploy('PolicyRegistry',[e.owner.address]);const intent=await legacyDeploy('IntentRegistry');const validator=await legacyDeploy('EchoPolicyValidator',[registry,intent]);const delegate=await legacyDeploy('EchoDelegationModule',[validator]);
  const mint=await e.ownerContext.wc.writeContract({address:e.policy.asset,abi:tokenAbi,functionName:'mint',args:[e.owner.address,1000000n]});await e.ownerContext.pc.waitForTransactionReceipt({hash:mint});
  const block=await e.ownerContext.pc.getBlock();
  const authorization={from:e.owner.address,to:e.policy.payTo,value:'100000',validAfter:'0',validBefore:(block.timestamp+300n).toString(),nonce:hashJson('echo-7702-comparison')};
  const signature=await e.owner.signTypedData({domain:{name:'USDC',version:'2',chainId:31337,verifyingContract:e.policy.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{...authorization,value:100000n,validAfter:0n,validBefore:BigInt(authorization.validBefore)}});
  const accepted:PaymentRequirements={scheme:'exact',network:'eip155:31337',asset:e.policy.asset,amount:'100000',payTo:e.policy.payTo,maxTimeoutSeconds:300,extra:{name:'USDC',version:'2'}};
  const payload:PaymentPayload={x402Version:2,accepted,payload:{authorization,signature}};
  const before=await e.facilitator.verify(payload,accepted);if(!before.isValid)throw new Error('EOA_CONTROL_FAILED');
  const auth=await e.ownerContext.wc.signAuthorization({contractAddress:delegate,executor:e.operator});
  const attach=await e.operatorContext.wc.sendTransaction({to:e.operator.address,authorizationList:[auth]});const attached=await e.operatorContext.pc.waitForTransactionReceipt({hash:attach});
  const code=await e.operatorContext.pc.getCode({address:e.owner.address});if(attached.status!=='success'||!code?.startsWith('0xef0100'))throw new Error('REAL_7702_ATTACHMENT_FAILED');
  const after=await e.facilitator.verify(payload,accepted);if(after.isValid)throw new Error('ECHO_1271_UNEXPECTEDLY_ACCEPTED');
  let tokenRejected=false;
  try{await e.operatorContext.pc.simulateContract({address:e.policy.asset,abi:tokenAbi,functionName:'transferWithAuthorization',args:[authorization.from,authorization.to,100000n,0n,BigInt(authorization.validBefore),authorization.nonce,signature]});}catch{tokenRejected=true;}
  if(!tokenRejected)throw new Error('ECHO_TOKEN_SIMULATION_ACCEPTED');
  const registered=await e.client.prepareStep('eth-stats');const positive=await e.facilitator.verify(registered.payload,registered.requirements);const result=await e.client.purchaseStep('eth-stats');
  if(!positive.isValid||result.paymentState!=='settled')throw new Error('MANDATE_CONTROL_FAILED');
  writeEvidence('artifacts/account-comparison.json',{environment:'LOCAL_ANVIL_MOCK_USDC',echoCommit:'bf68bec76cb4b1394271e0d6043e6d2221d71334',plainEOA:{verify:true},echo7702:{delegate,registry,validator,attachmentTx:attach,delegationCode:code,verify:false,reason:after.invalidReason,tokenSimulationRejected:tokenRejected,policyInitialization:'not required for absent isValidSignature selector; no swap/EntryPoint compatibility claim'},mandate1271:{verify:true,settled:true,transaction:result.settlementTx,signatureFormat:'65-byte ECDSA from policy sessionSigner; digest must already be registered'},limitations:['mock asset; public native USDC evidence is separate','comparison does not repair Echo or verify ERC4337 bundling']});
  console.log(JSON.stringify({plainEOA:true,echo7702:false,mandate1271:true,evidence:'artifacts/account-comparison.json'}));
} finally {await e.close();}
