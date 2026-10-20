import {it,expect,vi} from "vitest";
import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createPublicClient,createWalletClient,http,encodeDeployData,type Hex} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {startAnvil,TEST_MNEMONIC} from "../../../experiments/harness.js";
import {M3Journal} from "../journal.js";
it("transaction journal resumes the same signed deployment and treats RPC timeout as unknown",async()=>{
  const node=await startAnvil();
  try {
    const chain={id:31337,name:"M3 Anvil",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[node.rpc]}}};
    const c={pc:createPublicClient({chain,transport:http(node.rpc),pollingInterval:100}),wc:createWalletClient({chain,transport:http(node.rpc),account:mnemonicToAccount(TEST_MNEMONIC)})};
    const a=JSON.parse(readFileSync("mandate/contracts/out/TestUSDC.sol/TestUSDC.json","utf8"));
    const intent={data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object as Hex})};
    const path=join(mkdtempSync(join(tmpdir(),"mandate-m3-journal-")),"transactions.json");
    const journal=new M3Journal(path,10n**18n);const receipt=await journal.send("deploy",c,intent);
    const original=JSON.parse(readFileSync(path,"utf8"));
    const recovered=new M3Journal(path,10n**18n),broadcast=vi.spyOn(c.wc,"sendRawTransaction");
    const lookup=vi.spyOn(c.pc,"getTransactionReceipt").mockRejectedValueOnce(new Error("RPC timeout"));
    await expect(recovered.send("deploy",c,intent)).rejects.toThrow("RPC timeout");expect(broadcast).not.toHaveBeenCalled();lookup.mockRestore();
    vi.spyOn(c.pc,"getBlock").mockResolvedValueOnce({hash:"0x"+"00".repeat(32)} as never);
    expect((await recovered.send("deploy",c,intent)).transactionHash).toBe(receipt.transactionHash);
    expect(broadcast).not.toHaveBeenCalled();expect(JSON.parse(readFileSync(path,"utf8"))[0].raw).toBe(original[0].raw);
    expect(JSON.parse(readFileSync(path,"utf8"))[0].headerObservations).toHaveLength(1);
    await expect(recovered.send("deploy",c,{data:"0x00"})).rejects.toThrow("TRANSACTION_INTENT_CHANGED");
    expect(recovered.evidence()[0]).not.toHaveProperty("raw");
  } finally{node.stop();}
});
