import { localFixture,writeEvidence } from './harness.js';
import { walletAbi,tokenAbi } from '../packages/core/chain.js';

const env=await localFixture();
try {
  const result=await env.client.purchaseStep('eth-stats');
  if(result.paymentState!=='settled'||result.resultState!=='valid') throw new Error(result.errorCode ?? 'LOCAL_DEMO_INCOMPLETE');
  const repeat=await env.client.purchaseStep('eth-stats');
  const balance=await env.operatorContext.pc.readContract({address:env.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[env.policy.payTo]});
  const budget=await env.operatorContext.pc.readContract({address:env.policy.wallet,abi:walletAbi,functionName:'getMandate',args:[env.policy.mandateId]});
  const evidence={environment:'LOCAL_ANVIL_MOCK_USDC',nodeVersion:process.version,...env.client.exportEvidence(),checks:{repeatSameNonce:repeat.nonce===result.nonce,merchantBalance:balance.toString(),occupied:budget.occupied.toString()}};
  writeEvidence('artifacts/local-payment.json',evidence);
  console.log(JSON.stringify({paymentState:result.paymentState,resultState:result.resultState,merchantBalance:balance.toString(),occupied:budget.occupied.toString(),evidence:'artifacts/local-payment.json'}));
} finally {await env.close();}
