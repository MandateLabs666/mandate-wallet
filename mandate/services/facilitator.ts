import {x402Facilitator,type PendingSettlementStore} from "@x402/core/facilitator";
import {ExactEvmScheme} from "@x402/evm/exact/facilitator";
import {toFacilitatorEvmSigner} from "@x402/evm";
import {encodeFunctionData,keccak256,toHex,type Abi,type Hex} from "viem";
import type {Network,PaymentPayload,PaymentRequirements} from "@x402/core/types";
import {DurableTransactions} from "./transactions.js";
import {MandateError} from "../sdk/model.js";
export function settlementId(signature:string){return "settle:"+keccak256(toHex(signature));}
export function controlledFacilitator(transactions:DurableTransactions) {
  const {pc,wc,store}=transactions;
  const pending:PendingSettlementStore={
    get:async signature=>{const row=store.transaction(settlementId(signature));if(!row)return;await transactions.send(row.id);return row.hash;},
    set:async(signature,hash)=>{const row=store.transaction(settlementId(signature));if(!row || row.hash!==hash)throw new MandateError("FACILITATOR_HASH_NOT_PERSISTED");},
    delete:async()=>{/* Retain original signed transactions after confirmation; retries can only reconcile. */},
  };
  const signer=toFacilitatorEvmSigner({
    address:wc.account.address,
    readContract:async args=>(await pc.simulateContract({...args,account:args.account??wc.account.address,abi:args.abi as never,args:args.args as never} as never)).result,
    verifyTypedData:args=>pc.verifyTypedData(args as never),
    writeContract:async args=>{
      if(args.functionName!=="transferWithAuthorization")throw new MandateError("FACILITATOR_METHOD_UNSUPPORTED");
      const a=args.args,signature=a.length===7?String(a[6]):String(a[7])+String(a[8]).slice(2)+Number(a[6]).toString(16).padStart(2,"0");
      const id=settlementId(signature),data=encodeFunctionData({abi:args.abi as Abi,functionName:args.functionName,args:a});
      const row=await transactions.prepare(id,args.address,data);await transactions.send(id);return row.hash;
    },
    sendTransaction:async()=>{throw new MandateError("FACILITATOR_GENERIC_TRANSACTION_UNSUPPORTED");},
    waitForTransactionReceipt:args=>pc.waitForTransactionReceipt({...args,confirmations:transactions.confirmations}),
    getCode:args=>pc.getCode(args),
  },{confirmationTimeoutMs:30000});
  const facilitator=new x402Facilitator().register(`eip155:${wc.chain.id}` as Network,new ExactEvmScheme(signer,{pendingSettlementStore:pending,simulateInSettle:true,eip6492AllowedFactories:[]}));
  return Object.assign(facilitator,{reconcileOriginalSettlement:async(payload:PaymentPayload,requirements:PaymentRequirements)=>{
    const signature=(payload.payload as {signature?:unknown}).signature;
    if(typeof signature!=="string" || !store.transaction(settlementId(signature)))throw new MandateError("ORIGINAL_SETTLEMENT_TRANSACTION_MISSING");
    return facilitator.settle(payload,requirements);
  }});
}
