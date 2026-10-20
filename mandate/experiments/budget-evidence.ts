import {getAbiItem,type PublicClient,type Address,type Hex,type TransactionReceipt} from "viem";
import {accountAbi} from "../sdk/accountAbi.js";
// The fixed account updates occupied only on PaymentRegistered/PaymentReleased; versions preserve it.
export async function budgetAtReceipt(pc:PublicClient,wallet:Address,id:Hex,startBlock:bigint,receipt:TransactionReceipt) {
  const block=await pc.getBlock({blockNumber:receipt.blockNumber});
  if(block.hash!==receipt.blockHash)throw new Error("BUDGET_CHECKPOINT_NOT_CANONICAL");
  const registered=[];
  const released=[];
  for(let fromBlock=startBlock;fromBlock<=receipt.blockNumber;fromBlock+=200n) {
    const toBlock=fromBlock+199n<receipt.blockNumber?fromBlock+199n:receipt.blockNumber;
    const [r,s]=await Promise.all([
      pc.getLogs({address:wallet,event:getAbiItem({abi:accountAbi,name:"PaymentRegistered"}),args:{mandateId:id},fromBlock,toBlock,strict:true}),
      pc.getLogs({address:wallet,event:getAbiItem({abi:accountAbi,name:"PaymentReleased"}),args:{mandateId:id},fromBlock,toBlock,strict:true}),
    ]);registered.push(...r);released.push(...s);
  }
  const changes=[...registered.map(log=>({value:log.args.value!,block:log.blockNumber!,index:log.transactionIndex!,hash:log.transactionHash})),
    ...released.map(log=>({value:-log.args.value!,block:log.blockNumber!,index:log.transactionIndex!,hash:log.transactionHash}))]
    .filter(log=>log.block<receipt.blockNumber || log.index<=receipt.transactionIndex);
  const occupied=changes.reduce((sum,c)=>sum+c.value,0n);
  if(occupied<0n)throw new Error("INVALID_BUDGET_EVENT_PREFIX");
  return {source:"canonical-account-event-prefix",transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,occupied:occupied.toString(),matchingChangesInReceipt:changes.filter(c=>c.hash===receipt.transactionHash).length};
}
