import {it,expect,vi} from "vitest";
import {createPublicClient,http,type Hex,type TransactionReceipt} from "viem";
import {budgetAtReceipt} from "../budget-evidence.js";
it("historical failure budget excludes later registration and release in the same block",async()=>{
  const pc=createPublicClient({transport:http("http://127.0.0.1:1")});
  const blockHash="0x"+"ab".repeat(32) as Hex, transactionHash="0x"+"cd".repeat(32) as Hex;
  vi.spyOn(pc,"getBlock").mockResolvedValue({hash:blockHash} as never);
  const logs=vi.spyOn(pc,"getLogs").mockImplementation(async(args)=>{
    const registered=[{args:{value:100000n},blockNumber:10n,transactionIndex:1,transactionHash:"0x01"},{args:{value:50000n},blockNumber:10n,transactionIndex:3,transactionHash:"0x02"}];
    const released=[{args:{value:50000n},blockNumber:20n,transactionIndex:4,transactionHash:"0x03"}];
    return ((args as {event:{name:string}}).event.name==="PaymentRegistered"?registered:released.filter(l=>l.blockNumber<=(args as {toBlock:bigint}).toBlock)) as never;
  });
  const receipt={blockNumber:10n,transactionIndex:2,transactionHash,blockHash} as TransactionReceipt;
  expect((await budgetAtReceipt(pc,"0x1111111111111111111111111111111111111111",blockHash,1n,receipt)).occupied).toBe("100000");
  const revoked={...receipt,blockNumber:20n,transactionIndex:3};
  expect((await budgetAtReceipt(pc,"0x1111111111111111111111111111111111111111",blockHash,1n,revoked)).occupied).toBe("150000");
  expect(logs).toHaveBeenCalledTimes(4);
});
it("paginates RPC log scans into at most 200 blocks without counting an event twice",async()=>{
  const pc=createPublicClient({transport:http("http://127.0.0.1:1")});
  const hash="0x"+"ab".repeat(32) as Hex;
  vi.spyOn(pc,"getBlock").mockResolvedValue({hash} as never);
  const calls=vi.spyOn(pc,"getLogs").mockImplementation(async(args)=>{
    const a=args as {event:{name:string};fromBlock:bigint;toBlock:bigint};
    expect(a.toBlock-a.fromBlock).toBeLessThanOrEqual(199n);
    return (a.event.name==="PaymentRegistered" && a.fromBlock<=210n && a.toBlock>=210n?[{args:{value:100000n},blockNumber:210n,transactionIndex:1,transactionHash:"0x01"}]:[]) as never;
  });
  const receipt={blockNumber:501n,transactionIndex:2,transactionHash:hash,blockHash:hash} as TransactionReceipt;
  expect((await budgetAtReceipt(pc,"0x1111111111111111111111111111111111111111",hash,1n,receipt)).occupied).toBe("100000");
  expect(calls).toHaveBeenCalledTimes(6);
});
