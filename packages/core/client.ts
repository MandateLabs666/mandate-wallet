import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentRequired, PaymentRequirements, PaymentPayload, Network } from '@x402/core/types';
import { hashTypedData, parseEventLogs, getAbiItem, getAddress, type LocalAccount, type Hex } from 'viem';
import { clients, walletAbi, tokenAbi, registerTypes, authorizationTypes, type PaymentParams } from './chain.js';
import { PaymentStore, type RecordState } from './store.js';
import { PolicySpec, ActionProof, PaymentCommitment, ContainmentDecisionLog, M1Error, hashJson, nonceFor, stepId, canonical, type Policy } from './model.js';
import { expectedResult } from './merchant.js';

export function validateQuote(required:PaymentRequired,policy:Policy,url:string):PaymentRequirements {
  if(required.x402Version!==2||required.resource.url!==url) throw new M1Error('RESOURCE_OR_VERSION_MISMATCH');
  const r=required.accepts.find(r=>r.scheme==='exact'&&r.network===`eip155:${policy.chainId}`&&r.asset.toLowerCase()===policy.asset.toLowerCase()&&r.payTo.toLowerCase()===policy.payTo.toLowerCase()
    &&(!r.extra.assetTransferMethod||r.extra.assetTransferMethod==='eip3009'));
  if(!r||typeof r.extra.name!=='string'||!r.extra.name||r.extra.version!=='2'||!/^[1-9][0-9]*$/.test(r.amount)||BigInt(r.amount)>BigInt(policy.maxPerPayment)
    ||!Number.isSafeInteger(r.maxTimeoutSeconds)||r.maxTimeoutSeconds<=0||r.maxTimeoutSeconds>300) throw new M1Error('QUOTE_UNSUPPORTED');
  return r;
}

export class MandateClient {
  readonly policy:Policy;
  constructor(policy:Policy,readonly chain:ReturnType<typeof clients>,readonly session:LocalAccount,readonly store:PaymentStore,readonly approvedUrls:Record<string,string>,readonly deploymentBlock:bigint,readonly confirmations=1) {
    this.policy=PolicySpec.parse(policy);
    if(session.address!==this.policy.sessionSigner||chain.pc.chain.id!==policy.chainId||chain.wc.account.address===policy.owner) throw new M1Error('ROLE_OR_CHAIN_MISMATCH');
  }
  key(step:Hex) { return `${this.policy.chainId}:${this.policy.wallet.toLowerCase()}:${this.policy.mandateId}:${step}`; }
  private async prepare(name:string,url:string):Promise<RecordState> {
    const step=stepId(name); const key=this.key(step); const existing=this.store.get(key);
    if(existing) { if(existing.url!==url) throw new M1Error('ORDER_REUSE_MISMATCH'); return existing; }
    if(this.approvedUrls[name]!==url||!this.policy.stepIds.includes(step)) throw new M1Error('STEP_UNAPPROVED');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status!==402) throw new M1Error('EXPECTED_402');
    const header=response.headers.get('payment-required'); if(!header) throw new M1Error('PAYMENT_REQUIRED_MISSING');
    const required=decodePaymentRequiredHeader(header); const requirements=validateQuote(required,this.policy,url);
    const block=await this.chain.pc.getBlock();
    const validBefore=BigInt(Math.min(Number(block.timestamp)+requirements.maxTimeoutSeconds,this.policy.expiresAt));
    if(validBefore<=block.timestamp) throw new M1Error('POLICY_EXPIRED');
    const p:PaymentParams={mandateId:this.policy.mandateId,stepId:step,requestHash:hashJson({method:'GET',url}),quoteHash:hashJson(requirements),to:getAddress(requirements.payTo),value:BigInt(requirements.amount),validAfter:0n,validBefore,nonce:nonceFor(this.policy.chainId,this.policy.wallet,this.policy.mandateId,step)};
    const registrationSignature=await this.session.signTypedData({domain:{name:'MandateM1',version:'1',chainId:this.policy.chainId,verifyingContract:this.policy.wallet},types:registerTypes,primaryType:'RegisterPayment',message:p});
    const authorization={from:this.policy.wallet,to:p.to,value:p.value.toString(),validAfter:'0',validBefore:p.validBefore.toString(),nonce:p.nonce};
    const authMessage={...authorization,value:p.value,validAfter:0n,validBefore:p.validBefore};
    const authTyped={domain:{name:requirements.extra.name as string,version:'2',chainId:this.policy.chainId,verifyingContract:this.policy.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization' as const,message:authMessage};
    const digest=hashTypedData(authTyped);
    if(await this.chain.pc.readContract({address:this.policy.wallet,abi:walletAbi,functionName:'paymentDigest',args:[p]})!==digest) throw new M1Error('TOKEN_DOMAIN_MISMATCH');
    const proof=ActionProof.parse({schemaVersion:1,mandateId:p.mandateId,stepId:step,wallet:this.policy.wallet,chainId:this.policy.chainId,nonce:p.nonce,paymentDigest:digest,requestHash:p.requestHash,quoteHash:p.quoteHash,registrationSignature,evidenceSource:'local'});
    // Persist all authorization parameters before any chain operation. The empty signature is replaced only before insert.
    const record:RecordState={key,nonce:p.nonce,digest,mandateId:p.mandateId,stepId:step,chainId:this.policy.chainId,wallet:this.policy.wallet,asset:this.policy.asset,url,requestHash:p.requestHash,quoteHash:p.quoteHash,requirements,payload:{x402Version:2,resource:required.resource,accepted:requirements,payload:{authorization,signature:''}},proof,paymentState:'registering',serviceState:'not_requested',resultState:'unchecked'};
    // A payment signature is not generated until the registration receipt has succeeded.
    if(!this.store.insert(record)) return this.store.get(key)!;
    try{return await this.registerAndSign(record,p,registrationSignature,authTyped);}catch(error){
      const reverted=(error as {walk?:(predicate:(e:unknown)=>boolean)=>unknown}).walk?.(e=>!!(e as {data?:{errorName?:string}}).data?.errorName) as {data?:{errorName?:string}}|undefined;
      if(reverted?.data?.errorName){record.paymentState='rejected';record.errorCode=reverted.data.errorName;this.store.save(record);}throw error;
    }
  }
  private async registerAndSign(record:RecordState,p:PaymentParams,registrationSignature:Hex,authTyped:Parameters<LocalAccount['signTypedData']>[0]):Promise<RecordState> {
    const tx=await this.chain.wc.writeContract({address:this.policy.wallet,abi:walletAbi,functionName:'registerPayment',args:[p,registrationSignature]});
    record.registrationTx=tx; this.store.save(record);
    const receipt=await this.chain.pc.waitForTransactionReceipt({hash:tx,confirmations:this.confirmations,timeout:15000});
    if(receipt.status!=='success') {record.paymentState='rejected';record.errorCode='REGISTRATION_REVERTED';this.store.save(record);throw new M1Error('REGISTRATION_REVERTED');}
    const c=await this.chain.pc.readContract({address:this.policy.wallet,abi:walletAbi,functionName:'getCommitment',args:[record.digest]});
    if(!c.exists||c.released||c.nonce!==record.nonce) throw new M1Error('REGISTRATION_UNCONFIRMED');
    const signature=await this.session.signTypedData(authTyped as never);
    record.payload={...record.payload,payload:{...record.payload.payload,signature}};
    record.paymentState='reserved'; this.store.completeRegistration(record);
    return record;
  }
  async purchaseStep(name:string):Promise<RecordState> {
    const url=this.approvedUrls[name]; if(!url) throw new M1Error('STEP_UNAPPROVED');
    let record=await this.prepare(name,url);
    if(record.paymentState==='registering') return this.recoverRegistration(record);
    if(record.paymentState==='rejected'||record.paymentState==='released')return record;
    if(record.paymentState==='settled'&&record.serviceState==='returned') return record;
    record=await this.reconcilePayment(record);
    if(record.paymentState==='pending'||record.paymentState==='released'||record.paymentState==='rejected') return record;
    try {
      // Use the official core client with a deterministic, registered exact-scheme adapter.
      const client=new x402Client().setSpendControls({allowedAssets:[{network:`eip155:${this.policy.chainId}`,asset:this.policy.asset,maxAmountPerPayment:this.policy.maxPerPayment}]}).register(`eip155:${this.policy.chainId}` as Network,{scheme:'exact',createPaymentPayload:async()=>({x402Version:2,payload:record.payload.payload})});
      const payload:PaymentPayload=await client.createPaymentPayload({x402Version:2,resource:record.payload.resource!,accepts:[record.requirements]});
      if(canonical(payload)!==canonical(record.payload)) throw new M1Error('PAYLOAD_CHANGED');
      record.paymentState=record.paymentState==='settled'?'settled':'pending'; this.store.save(record);
      const response=await fetch(record.url,{headers:{'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)},redirect:'error',signal:AbortSignal.timeout(15000)});
      const header=response.headers.get('payment-response');
      if(header) { const settlement=decodePaymentResponseHeader(header); if(settlement.transaction?.startsWith('0x')) record.settlementTx=settlement.transaction as Hex; }
      if(response.ok) { record.result=await response.json();record.serviceState='returned';const asset=new URL(record.url).searchParams.get('asset') as 'ETH'|'BTC';record.resultState=canonical(record.result)===canonical(expectedResult(asset))?'valid':'invalid'; }
      else { record.serviceState='failed'; record.errorCode=`HTTP_${response.status}`; }
      this.store.save(record);
      return this.reconcilePayment(record);
    } catch(error) {
      if(this.policy.chainId===31337&&process.env.M1_DEBUG_LOCAL==='1') console.error(error);
      record.serviceState='unknown'; record.errorCode=error instanceof M1Error?error.code:'TRANSPORT_OR_SETTLEMENT_UNKNOWN';this.store.save(record);return this.reconcilePayment(record);
    }
  }
  async prepareStep(name:string):Promise<RecordState> {
    const url=this.approvedUrls[name];if(!url)throw new M1Error('STEP_UNAPPROVED');return this.prepare(name,url);
  }
  private async recoverRegistration(record:RecordState):Promise<RecordState> {
    const auth=record.payload.payload.authorization as {to:Hex;value:string;validAfter:string;validBefore:string;nonce:Hex};
    const p:PaymentParams={mandateId:record.mandateId,stepId:record.stepId,requestHash:record.requestHash,quoteHash:record.quoteHash,to:auth.to,value:BigInt(auth.value),validAfter:BigInt(auth.validAfter),validBefore:BigInt(auth.validBefore),nonce:auth.nonce};
    const typed={domain:{name:record.requirements.extra.name as string,version:'2',chainId:record.chainId,verifyingContract:record.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization' as const,message:{...auth,from:record.wallet,value:p.value,validAfter:p.validAfter,validBefore:p.validBefore}};
    const c=await this.chain.pc.readContract({address:record.wallet,abi:walletAbi,functionName:'getCommitment',args:[record.digest]});
    if(c.exists&&!record.registrationTx){
      const head=await this.chain.pc.getBlockNumber({cacheTime:0});
      for(let from=this.deploymentBlock;from<=head;from+=200n){
        const logs=await this.chain.pc.getLogs({address:record.wallet,event:getAbiItem({abi:walletAbi,name:'PaymentRegistered'}),args:{digest:record.digest},fromBlock:from,toBlock:from+199n<head?from+199n:head});
        if(logs[0]?.transactionHash){record.registrationTx=logs[0].transactionHash;this.store.save(record);break;}
      }
      if(!record.registrationTx)return record;
    }
    if(record.registrationTx){
      const r=await this.chain.pc.getTransactionReceipt({hash:record.registrationTx}).catch(()=>undefined);
      if(!r)return record;
      if(r.status!=='success'){record.paymentState='rejected';record.errorCode='REGISTRATION_REVERTED';this.store.save(record);return record;}
      const head=await this.chain.pc.getBlockNumber({cacheTime:0});const block=await this.chain.pc.getBlock({blockNumber:r.blockNumber});
      if(/^0x0+$/.test(r.blockHash)||block.hash!==r.blockHash||head-r.blockNumber+1n<BigInt(this.confirmations)||!c.exists)return record;
    }
    if(!c.exists) {
      return this.registerAndSign(record,p,(record.proof as {registrationSignature:Hex}).registrationSignature,typed);
    }
    if(c.released) {record.paymentState='released';this.store.save(record);return record;}
    record.payload={...record.payload,payload:{...record.payload.payload,signature:await this.session.signTypedData(typed)}};record.paymentState='reserved';this.store.completeRegistration(record);return record;
  }
  async reconcilePayment(record:RecordState):Promise<RecordState> {
    try {
      if(await this.chain.pc.getChainId()!==record.chainId) throw new M1Error('RPC_CHAIN_MISMATCH');
      let receipt=record.settlementTx ? await this.chain.pc.getTransactionReceipt({hash:record.settlementTx}).catch(()=>undefined) : undefined;
      // Public Base RPC limits eth_getLogs to 200 blocks. Lost HTTP responses
      // require event discovery, while a known settlement uses its receipt first.
      if(!receipt) {
        const head=await this.chain.pc.getBlockNumber({cacheTime:0});
        for(let from=this.deploymentBlock;from<=head;from+=200n) {
          const to=from+199n<head?from+199n:head;
          const logs=await this.chain.pc.getLogs({address:record.asset,event:getAbiItem({abi:tokenAbi,name:'AuthorizationUsed'}),args:{authorizer:record.wallet,nonce:record.nonce},fromBlock:from,toBlock:to});
          const used=parseEventLogs({abi:tokenAbi,eventName:'AuthorizationUsed',logs}).find(l=>l.args.authorizer.toLowerCase()===record.wallet.toLowerCase()&&l.args.nonce===record.nonce);
          if(used?.transactionHash){receipt=await this.chain.pc.getTransactionReceipt({hash:used.transactionHash});break;}
        }
      }
      if(receipt) {
        const r=receipt;
        const used=parseEventLogs({abi:tokenAbi,eventName:'AuthorizationUsed',logs:r.logs.filter(l=>l.address.toLowerCase()===record.asset.toLowerCase())}).some(l=>l.args.authorizer.toLowerCase()===record.wallet.toLowerCase()&&l.args.nonce===record.nonce);
        const transfers=parseEventLogs({abi:tokenAbi,eventName:'Transfer',logs:r.logs.filter(l=>l.address.toLowerCase()===record.asset.toLowerCase())});
        const matched=transfers.some(l=>l.args.from.toLowerCase()===record.wallet.toLowerCase()&&l.args.to.toLowerCase()===record.requirements.payTo.toLowerCase()&&l.args.value===BigInt(record.requirements.amount));
        const current=await this.chain.pc.getBlockNumber({cacheTime:0}); const canonicalBlock=await this.chain.pc.getBlock({blockNumber:r.blockNumber});
        if(r.status==='success'&&used&&matched&&!/^0x0+$/.test(r.blockHash)&&canonicalBlock.hash===r.blockHash&&current-r.blockNumber+1n>=BigInt(this.confirmations)) {
          record.paymentState='settled';record.settlementTx=r.transactionHash;record.settlementBlockHash=r.blockHash;delete record.errorCode;this.store.save(record);return record;
        }
      }
      const c=await this.chain.pc.readContract({address:record.wallet,abi:walletAbi,functionName:'getCommitment',args:[record.digest]});
      const consumed=await this.chain.pc.readContract({address:record.asset,abi:tokenAbi,functionName:'authorizationState',args:[record.wallet,record.nonce]});
      const m=await this.chain.pc.readContract({address:record.wallet,abi:walletAbi,functionName:'getMandate',args:[record.mandateId]});
      const auth=record.payload.payload.authorization as {validBefore:string}; const now=(await this.chain.pc.getBlock()).timestamp;
      if(c.exists&&!c.released&&!consumed&&now>BigInt(auth.validBefore)) {
        // The contract rechecks expiry and unused nonce atomically. RPC failures
        // below retain an uncertain state; a timeout never releases budget locally.
        const tx=await this.chain.wc.writeContract({address:record.wallet,abi:walletAbi,functionName:'releaseExpired',args:[record.digest]});
        const release=await this.chain.pc.waitForTransactionReceipt({hash:tx,confirmations:this.confirmations,timeout:15000});
        if(release.status!=='success'||!(await this.chain.pc.readContract({address:record.wallet,abi:walletAbi,functionName:'getCommitment',args:[record.digest]})).released)throw new M1Error('RELEASE_UNCONFIRMED');
        record.paymentState='released';
      }
      else if(c.released) record.paymentState='released';
      else if(consumed||record.settlementTx) record.paymentState='pending';
      else if(m.revoked||now>=BigInt(auth.validBefore)) record.paymentState='rejected';
      else if(c.exists) record.paymentState='reserved';
      else if(record.paymentState==='rejected') record.paymentState='rejected';
      else record.paymentState='registering';
      this.store.save(record,true);
      return record;
    } catch { record.paymentState='pending';record.errorCode='RECONCILIATION_UNKNOWN';this.store.save(record,true);return record; }
  }
  exportEvidence() {
    const records=this.store.all().filter(r=>r.mandateId===this.policy.mandateId);
    const commitments=records.filter(r=>r.registrationTx&&r.payload.payload.signature).map(r=>{
      const a=r.payload.payload.authorization as {to:Hex;value:string;validAfter:string;validBefore:string};
      return PaymentCommitment.parse({schemaVersion:1,mandateId:r.mandateId,stepId:r.stepId,wallet:r.wallet,chainId:r.chainId,asset:r.asset,payTo:a.to,amount:a.value,validAfter:a.validAfter,validBefore:a.validBefore,nonce:r.nonce,paymentDigest:r.digest,registrationTx:r.registrationTx});
    });
    // Export-time status snapshots; this is not an independent or append-only witness log.
    const decisions=records.map(r=>ContainmentDecisionLog.parse({schemaVersion:1,mandateId:r.mandateId,stepId:r.stepId,decision:r.paymentState==='pending'||r.paymentState==='registering'?'pending':r.paymentState==='rejected'||r.paymentState==='released'?'reject':'allow',code:r.errorCode??r.paymentState.toUpperCase(),evidenceRefs:[r.registrationTx,r.settlementTx].filter(Boolean),timestamp:Math.floor(Date.now()/1000),source:'local'}));
    return {schemaVersion:1,policy:this.policy,source:'local_and_chain',guarantees:['payment field and budget constraints','receipt-linked fixture result'],limitations:['no independent HTTP provenance','no general service quality proof','test prototype'],records,commitments,decisions};
  }
}
