import { describe,it,expect,vi } from 'vitest';
import { localFixture,TEST_MNEMONIC } from '../experiments/harness.js';
import { clients,walletAbi,tokenAbi } from '../packages/core/chain.js';
import { MandateClient } from '../packages/core/client.js';
import { PaymentStore } from '../packages/core/store.js';
import { mnemonicToAccount } from 'viem/accounts';
import { parseEventLogs } from 'viem';

describe('T2 local x402 verify, settlement and faults',()=>{
  it('settles once, checks result and resumes from durable storage',async()=>{
    const e=await localFixture();let restored:PaymentStore|undefined;
    try{
      const r=await e.client.purchaseStep('eth-stats');expect(r.paymentState).toBe('settled');expect(r.resultState).toBe('valid');
      e.store.close();restored=new PaymentStore(`${e.dir}/client.sqlite`);
      const c=new MandateClient(e.policy,e.operatorContext,e.session,restored,e.urls,e.wallet.block);
      const retry=await c.purchaseStep('eth-stats');expect(retry.nonce).toBe(r.nonce);
      expect(await e.operatorContext.pc.readContract({address:e.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[e.policy.payTo]})).toBe(100000n);
      expect(()=>restored!.save({...retry,nonce:('0x'+'f'.repeat(64)) as `0x${string}`})).toThrow('PAYMENT_IMMUTABLE');
    }finally{restored?.close();await e.close();}
  });
  it('two workers with different gas signers cannot reserve above the shared budget',async()=>{
    const e=await localFixture();const secondStore=new PaymentStore(`${e.dir}/worker2.sqlite`);
    try{
      const second=new MandateClient(e.policy,clients(31337,e.node.rpc,mnemonicToAccount(TEST_MNEMONIC,{addressIndex:4})),e.session,secondStore,e.urls,e.wallet.block);
      const results=await Promise.allSettled([e.client.purchaseStep('eth-stats'),second.purchaseStep('btc-stats')]);
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      const m=await e.operatorContext.pc.readContract({address:e.policy.wallet,abi:walletAbi,functionName:'getMandate',args:[e.policy.mandateId]});expect(m.occupied).toBe(100000n);
      expect(await e.operatorContext.pc.readContract({address:e.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[e.policy.payTo]})).toBe(100000n);
      // Both simulations can pass before either transaction is mined. Select
      // the actual loser, which may be rejected by simulation or by its receipt.
      const rejectedClient=results[0].status==='rejected'?e.client:second;
      const step=rejectedClient===e.client?'eth-stats':'btc-stats';
      expect((await rejectedClient.purchaseStep(step)).paymentState).toBe('rejected');
    }finally{secondStore.close();await e.close();}
  });
  it('recovers a registration mined before the client saved its hash or payment signature',async()=>{
    const e=await localFixture();const restored=new PaymentStore(`${e.dir}/crash-recovery.sqlite`);
    try{
      const r=await e.client.prepareStep('eth-stats');
      restored.insert({...r,registrationTx:undefined,paymentState:'registering',payload:{...r.payload,payload:{...r.payload.payload,signature:''}}});
      const client=new MandateClient(e.policy,e.operatorContext,e.session,restored,e.urls,e.wallet.block);
      const recovered=await client.purchaseStep('eth-stats');expect(recovered.paymentState).toBe('reserved');expect(recovered.registrationTx).toBe(r.registrationTx);expect(recovered.payload.payload.signature).toBe(r.payload.payload.signature);
      const paid=await client.purchaseStep('eth-stats');expect(paid.paymentState).toBe('settled');expect(paid.nonce).toBe(r.nonce);
      expect((await e.operatorContext.pc.readContract({address:e.policy.wallet,abi:walletAbi,functionName:'getMandate',args:[e.policy.mandateId]})).occupied).toBe(100000n);
    }finally{restored.close();await e.close();}
  });
  it('revoke after successful facilitator verify defeats actual settlement',async()=>{
    const e=await localFixture();try{
      const r=await e.client.prepareStep('eth-stats');expect((await e.facilitator.verify(r.payload,r.requirements)).isValid).toBe(true);
      const hash=await e.ownerContext.wc.writeContract({address:e.policy.wallet,abi:walletAbi,functionName:'revokeMandate',args:[e.policy.mandateId]});await e.ownerContext.pc.waitForTransactionReceipt({hash});
      expect((await e.facilitator.settle(r.payload,r.requirements)).success).toBe(false);
      expect(await e.operatorContext.pc.readContract({address:e.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[e.policy.payTo]})).toBe(0n);
      expect((await e.client.reconcilePayment(r)).paymentState).toBe('rejected');
    }finally{await e.close();}
  });
  it('altering an authorization defeats verifier and actual token simulation',async()=>{
    const e=await localFixture();try{
      const r=await e.client.prepareStep('eth-stats');const auth=r.payload.payload.authorization as {from:`0x${string}`;to:`0x${string}`;value:string;validAfter:string;validBefore:string;nonce:`0x${string}`};
      const bad={...r.payload,payload:{...r.payload.payload,authorization:{...auth,value:'99999'}}};expect((await e.facilitator.verify(bad,r.requirements)).isValid).toBe(false);
      await expect(e.operatorContext.pc.simulateContract({address:e.policy.asset,abi:tokenAbi,functionName:'transferWithAuthorization',args:[auth.from,auth.to,99999n,BigInt(auth.validAfter),BigInt(auth.validBefore),auth.nonce,r.payload.payload.signature as `0x${string}`]})).rejects.toThrow();
    }finally{await e.close();}
  });
  it('a lost settlement response is reconciled before retry and never charged twice',async()=>{
    const e=await localFixture();const original=globalThis.fetch;
    try{
      await e.operatorContext.pc.request({method:'anvil_mine' as never,params:['0xc9'] as never});
      const getLogs=e.operatorContext.pc.getLogs;
      vi.spyOn(e.operatorContext.pc,'getLogs').mockImplementation(async parameters=>{
        if(!parameters)throw new Error('explicit block range required');
        expect(BigInt(parameters.toBlock!)-BigInt(parameters.fromBlock!)).toBeLessThanOrEqual(199n);
        return getLogs(parameters);
      });
      await e.client.prepareStep('eth-stats');let lost=false;
      globalThis.fetch=async(input,init)=>{const r=await original(input,init);if(!lost&&(init?.headers as Record<string,string>|undefined)?.['PAYMENT-SIGNATURE']){lost=true;throw new Error('injected lost response');}return r;};
      const r=await e.client.purchaseStep('eth-stats');expect(r.paymentState).toBe('settled');expect(r.serviceState).toBe('unknown');
      globalThis.fetch=original;const retry=await e.client.purchaseStep('eth-stats');expect(retry.resultState).toBe('valid');expect(retry.nonce).toBe(r.nonce);
      expect(await e.operatorContext.pc.readContract({address:e.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[e.policy.payTo]})).toBe(100000n);
    }finally{globalThis.fetch=original;await e.close();}
  });
  it('service failure after payment preserves payment and returns cached result on retry',async()=>{
    const e=await localFixture({failAfterPayment:true});try{
      const r=await e.client.purchaseStep('eth-stats');expect(r.paymentState).toBe('settled');expect(r.serviceState).toBe('failed');
      const retry=await e.client.purchaseStep('eth-stats');expect(retry.resultState).toBe('valid');
      expect(await e.operatorContext.pc.readContract({address:e.policy.asset,abi:tokenAbi,functionName:'balanceOf',args:[e.policy.payTo]})).toBe(100000n);
    }finally{await e.close();}
  });
  it('unused expired commitment releases safely without allowing a new payment for the same step',async()=>{
    const e=await localFixture();try{
      const r=await e.client.prepareStep('eth-stats');const auth=r.payload.payload.authorization as {validBefore:string};
      await e.operatorContext.pc.request({method:'evm_setNextBlockTimestamp' as never,params:[Number(auth.validBefore)+1] as never});await e.operatorContext.pc.request({method:'evm_mine' as never});
      expect((await e.client.reconcilePayment(r)).paymentState).toBe('released');
      const m=await e.operatorContext.pc.readContract({address:e.policy.wallet,abi:walletAbi,functionName:'getMandate',args:[e.policy.mandateId]});expect(m.occupied).toBe(0n);
      expect((await e.client.purchaseStep('eth-stats')).paymentState).toBe('released');
    }finally{await e.close();}
  });
  it('RPC timeout preserves the exact reserved payment and its occupied budget',async()=>{
    const e=await localFixture();try{
      const r=await e.client.prepareStep('eth-stats');const payload=JSON.stringify(r.payload);
      const fault=vi.spyOn(e.operatorContext.pc,'getLogs').mockRejectedValue(new Error('injected RPC timeout'));
      expect((await e.client.reconcilePayment(r)).paymentState).toBe('pending');fault.mockRestore();
      expect((await e.operatorContext.pc.readContract({address:e.policy.wallet,abi:walletAbi,functionName:'getMandate',args:[e.policy.mandateId]})).occupied).toBe(100000n);
      const restored=await e.client.reconcilePayment(r);expect(restored.paymentState).toBe('reserved');expect(JSON.stringify(restored.payload)).toBe(payload);
      expect(e.store.get(r.key)?.nonce).toBe(r.nonce);
    }finally{await e.close();}
  });
  it('orphaned settlement returns to pending and does not free budget on local timeout',async()=>{
    const e=await localFixture();try{
      const snapshot=await e.operatorContext.pc.request({method:'evm_snapshot' as never});
      const r=await e.client.purchaseStep('eth-stats');expect(r.paymentState).toBe('settled');
      await e.operatorContext.pc.request({method:'evm_revert' as never,params:[snapshot] as never});
      expect((await e.client.reconcilePayment(r)).paymentState).toBe('pending');
      expect(e.store.get(r.key)?.nonce).toBe(r.nonce);
    }finally{await e.close();}
  });
});
