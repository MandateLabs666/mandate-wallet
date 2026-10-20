import {it,expect} from "vitest";
import {transactionExplorerURL} from "../explorer.js";
it("uses the matching public testnet explorer and supplies no explorer for local or unsupported chains",()=>{
 const hash='0x'+'ab'.repeat(32);
 expect(transactionExplorerURL(84532,hash)).toBe('https://sepolia.basescan.org/tx/'+hash);
 expect(transactionExplorerURL(11155111,hash)).toBe('https://sepolia.etherscan.io/tx/'+hash);
 for(const chain of [31337,8453,1,'84532',null,undefined])expect(transactionExplorerURL(chain,hash)).toBeUndefined();
});
it("refuses paths, URLs, markup and malformed values in place of a transaction hash",()=>{
 for(const hash of ['0x1234','https://evil.example/tx/','0x'+'ab'.repeat(32)+'?redirect=evil','<script>',undefined,null,{},'0x'+'zz'.repeat(32)])expect(transactionExplorerURL(84532,hash)).toBeUndefined();
});
