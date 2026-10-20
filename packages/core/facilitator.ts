import { x402Facilitator, type PendingSettlementStore } from '@x402/core/facilitator';
import { ExactEvmScheme } from '@x402/evm/exact/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { DatabaseSync } from 'node:sqlite';
import type { Network } from '@x402/core/types';
import { clients } from './chain.js';

export class DurablePending implements PendingSettlementStore {
  private db:DatabaseSync;
  constructor(path:string) { this.db=new DatabaseSync(path); this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pending(key TEXT PRIMARY KEY, hash TEXT NOT NULL)'); }
  async get(key:string) { return (this.db.prepare('SELECT hash FROM pending WHERE key=?').get(key) as {hash:string}|undefined)?.hash; }
  async set(key:string,hash:string) { this.db.prepare('INSERT INTO pending VALUES (?,?) ON CONFLICT(key) DO UPDATE SET hash=excluded.hash').run(key,hash); }
  async delete(key:string) { this.db.prepare('DELETE FROM pending WHERE key=?').run(key); }
  close() { this.db.close(); }
}
export function makeFacilitator(context:ReturnType<typeof clients>, pending:DurablePending) {
  const {pc,wc}=context;
  const signer=toFacilitatorEvmSigner({
    address:wc.account.address,
    readContract:async args=>(await pc.simulateContract({ ...args, account:args.account ?? wc.account.address, abi:args.abi as never, args:args.args as never } as never)).result,
    verifyTypedData:args=>pc.verifyTypedData(args as never),
    writeContract:async args=>{
      const tx=await wc.writeContract({ ...args, abi:args.abi as never, args:args.args as never } as never);
      // Persist immediately after broadcast, before the upstream receipt wait.
      if(args.functionName==='transferWithAuthorization') {
        const a=args.args;
        const signature=a.length===7 ? String(a[6]) : String(a[7])+String(a[8]).slice(2)+Number(a[6]).toString(16).padStart(2,'0');
        await pending.set(signature,tx);
      }
      return tx;
    },
    sendTransaction:args=>wc.sendTransaction(args),
    waitForTransactionReceipt:args=>pc.waitForTransactionReceipt(args),
    getCode:args=>pc.getCode(args),
  }, { confirmationTimeoutMs:10000 });
  return new x402Facilitator().register(`eip155:${pc.chain.id}` as Network,new ExactEvmScheme(signer,{pendingSettlementStore:pending,simulateInSettle:true}));
}
