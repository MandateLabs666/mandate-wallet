import {it,expect} from "vitest";
import type {TransactionReceipt} from "viem";
import {assertSameReceipts,receiptLogs} from "../receipt.js";
it("compares consensus receipt fields despite optional SDK metadata and rejects altered or orphaned logs",()=>{
  const hash=("0x"+"11".repeat(32)) as `0x${string}`,block=("0x"+"22".repeat(32)) as `0x${string}`;
  const r={transactionHash:hash,blockHash:block,blockNumber:10n,status:"success",gasUsed:100n,effectiveGasPrice:2n,logs:[{address:"0x1111111111111111111111111111111111111111",data:"0x",topics:[hash],blockHash:block,blockNumber:10n,transactionHash:hash,transactionIndex:0,logIndex:0,removed:false}]} as unknown as TransactionReceipt;
  const sdk={...r,logs:r.logs.map(log=>({...log,eventName:undefined,args:undefined}))};
  expect(()=>assertSameReceipts(r,sdk)).not.toThrow();expect(receiptLogs(sdk)).toHaveLength(1);
  expect(()=>assertSameReceipts(r,{...r,logs:r.logs.map(log=>({...log,data:"0x01"}))})).toThrow("RECEIPT_PROVIDER_MISMATCH");
  expect(()=>receiptLogs({...r,logs:r.logs.map(log=>({...log,blockHash:hash}))})).toThrow("RECEIPT_LOG_CONTEXT_INVALID");
  expect(()=>receiptLogs({...r,logs:r.logs.map(log=>({...log,removed:true}))})).toThrow("RECEIPT_LOG_CONTEXT_INVALID");
});
