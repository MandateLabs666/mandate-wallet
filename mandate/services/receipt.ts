import type {TransactionReceipt} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
export function receiptLogs(receipt:TransactionReceipt) {
  return receipt.logs.map(log=>{
    if(log.removed || log.blockHash!==receipt.blockHash || log.transactionHash!==receipt.transactionHash || log.blockNumber!==receipt.blockNumber || log.logIndex===null || log.transactionIndex===null)throw new MandateError("RECEIPT_LOG_CONTEXT_INVALID");
    return {address:log.address.toLowerCase(),data:log.data.toLowerCase(),topics:log.topics.map(t=>t.toLowerCase()),blockNumber:log.blockNumber.toString(),blockHash:log.blockHash.toLowerCase(),transactionHash:log.transactionHash.toLowerCase(),transactionIndex:log.transactionIndex,logIndex:log.logIndex};
  });
}
export function assertSameReceipts(a:TransactionReceipt,b:TransactionReceipt) {
  if(a.transactionHash!==b.transactionHash||a.blockHash!==b.blockHash||a.blockNumber!==b.blockNumber||a.status!==b.status||a.gasUsed!==b.gasUsed||a.effectiveGasPrice!==b.effectiveGasPrice||canonicalJson(receiptLogs(a))!==canonicalJson(receiptLogs(b)))throw new MandateError("RECEIPT_PROVIDER_MISMATCH");
}
