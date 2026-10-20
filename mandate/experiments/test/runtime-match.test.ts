import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createPublicClient,createWalletClient,http,type Hex} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {startAnvil,TEST_MNEMONIC} from "../../../experiments/harness.js";
import {materializeRuntime,domainSeparator} from "../runtime-match.js";
it("reconstructs all constructor immutable bytes and matches actual deployed runtime exactly",async()=>{
  const node=await startAnvil();
  try {
    const account=mnemonicToAccount(TEST_MNEMONIC),chain={id:31337,name:"M3 Anvil",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[node.rpc]}}};
    const pc=createPublicClient({chain,transport:http(node.rpc),pollingInterval:100}),wc=createWalletClient({chain,account,transport:http(node.rpc)});
    const load=(name:string)=>JSON.parse(readFileSync(`mandate/contracts/out/${name}.sol/${name}.json`,"utf8"));
    const tokenArtifact=load("TestUSDC"),tokenHash=await wc.deployContract({abi:tokenArtifact.abi,bytecode:tokenArtifact.bytecode.object as Hex});
    const token=(await pc.waitForTransactionReceipt({hash:tokenHash})).contractAddress!;
    const artifact=load("MandateAccount"),hash=await wc.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object as Hex,args:[account.address,token]});
    const wallet=(await pc.waitForTransactionReceipt({hash})).contractAddress!;
    const identifiers=JSON.parse(readFileSync("artifacts/m3/immutable-identifiers.json","utf8"));
    const context={chainId:31337,address:wallet,owner:account.address,asset:token,tokenDomain:domainSeparator("USDC","2",31337,token)};
    const expected=materializeRuntime(artifact,identifiers.MandateAccount,context);
    expect(expected).toBe(await pc.getCode({address:wallet}));
    expect(materializeRuntime(artifact,identifiers.MandateAccount,{...context,chainId:84532})).not.toBe(expected);
    expect(materializeRuntime(artifact,identifiers.MandateAccount,{...context,owner:token})).not.toBe(expected);
    expect(()=>materializeRuntime(artifact,{},context)).toThrow("UNKNOWN_IMMUTABLE");
    expect(materializeRuntime(tokenArtifact,identifiers.TestUSDC,{chainId:31337,address:token,tokenDomain:context.tokenDomain})).toBe(await pc.getCode({address:token}));
  }finally{node.stop();}
});
