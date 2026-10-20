import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createPublicClient,createWalletClient,http,hashTypedData,encodeFunctionData,keccak256,toHex,type Abi,type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { startAnvil,TEST_MNEMONIC } from "../../../experiments/harness.js";
import { accountAbi } from "../accountAbi.js";
import { testTokenAbi } from "../testTokenAbi.js";
import { factoryAbi } from "../factoryAbi.js";
import { MandateReader,reconcilePayment } from "../reader.js";
import { nonceFor,requestHash,registrationTypedData,merchantQuoteTypedData,encodePayment,decodePayment,type Payment } from "../model.js";
it("SDK hashes match real contracts; signatures require registration and settlement evidence separates cancel from paid",async()=>{
  const node=await startAnvil();
  try {
    const owner=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:0}), session=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:1}), merchant=mnemonicToAccount(TEST_MNEMONIC,{addressIndex:2});
    const chain={id:31337,name:"M3 Anvil",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[node.rpc]}}};
    const pc=createPublicClient({chain,transport:http(node.rpc),pollingInterval:100}), wc=createWalletClient({chain,account:owner,transport:http(node.rpc)});
    async function send(to:Hex,data:Hex) { const hash=await wc.sendTransaction({to,data});return pc.waitForTransactionReceipt({hash}); }
    async function deploy(name:string) {const a=JSON.parse(readFileSync(`mandate/contracts/out/${name}.sol/${name}.json`,"utf8"));const hash=await wc.deployContract({abi:a.abi as Abi,bytecode:a.bytecode.object as Hex});return (await pc.waitForTransactionReceipt({hash})).contractAddress!;}
    const token=await deploy("TestUSDC"), factory=await deploy("MandateFactory"), salt=keccak256(toHex("sdk-test"));
    const wallet=await pc.readContract({address:factory,abi:factoryAbi,functionName:"predictAccount",args:[owner.address,token,salt]});
    await send(factory,encodeFunctionData({abi:factoryAbi,functionName:"createAccount",args:[token,salt]}));
    const id=keccak256(toHex("mandate")), sid=keccak256(toHex("session")), step=keccak256(toHex("step")), step2=keccak256(toHex("canceled-step")), mid=keccak256(toHex("merchant")), req=requestHash({method:"GET",url:"https://api.example/data",body:null});
    const now=(await pc.getBlock()).timestamp, expiry=now+3600n;
    await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[id,keccak256(toHex("task")),{budget:150000n,maxPerPayment:100000n,expiresAt:expiry},[{id:mid,payTo:merchant.address,quoteSigner:"0x0000000000000000000000000000000000000000"}],[{id:step,merchantId:mid,requestHash:req},{id:step2,merchantId:mid,requestHash:req}]]}));
    await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[id,sid,session.address,150000n,100000n,expiry,[step,step2]]}));
    await send(token,encodeFunctionData({abi:testTokenAbi,functionName:"mint",args:[wallet,1000000n]}));
    const reader=new MandateReader(pc,31337,wallet,{name:"USDC",version:"2",chainId:31337,verifyingContract:token});
    const p:Payment={mandateId:id,policyVersion:1n,sessionId:sid,sessionEpoch:1n,stepId:step,merchantId:mid,requestHash:req,quoteHash:keccak256(toHex("quote")),to:merchant.address,value:100000n,validAfter:0n,validBefore:now+300n,nonce:nonceFor(31337,wallet,id,step)};
    expect(decodePayment(JSON.parse(JSON.stringify(encodePayment(p))))).toEqual(p);
    await expect(reader.approvedPaymentData(p)).rejects.toThrow("PAYMENT_NOT_REGISTERED");
    const reg=await reader.checkedRegistrationData(p);expect(hashTypedData(reg)).toBe(await pc.readContract({address:wallet,abi:accountAbi,functionName:"registrationDigest",args:[p]}));
    expect(hashTypedData(merchantQuoteTypedData(31337,wallet,p))).toBe(await pc.readContract({address:wallet,abi:accountAbi,functionName:"quoteDigest",args:[p]}));
    await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[p,await session.signTypedData(reg),"0x"]}));
    const paymentData=await reader.approvedPaymentData(p);
    const signature=await session.signTypedData(paymentData);
    const settlement=await send(token,encodeFunctionData({abi:testTokenAbi,functionName:"transferWithAuthorization",args:[wallet,p.to,p.value,p.validAfter,p.validBefore,p.nonce,signature]}));
    expect((await reconcilePayment(pc,wallet,token,p,settlement.transactionHash,1)).state).toBe("paid");
    expect((await reconcilePayment(pc,wallet,token,p)).state).toBe("consumed_unknown");
    const p2={...p,stepId:step2,value:50000n,nonce:nonceFor(31337,wallet,id,step2)};
    await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[p2,await session.signTypedData(registrationTypedData(31337,wallet,p2)),"0x"]}));
    const cancellation=await send(token,encodeFunctionData({abi:testTokenAbi,functionName:"cancelForTest",args:[wallet,p2.nonce]}));
    expect((await reconcilePayment(pc,wallet,token,p2,cancellation.transactionHash,1)).state).toBe("canceled");
    expect((await reconcilePayment(pc,wallet,token,p2)).state).toBe("consumed_unknown");
    const budget=await reader.readBudget(id,sid);expect(budget.policy.occupied).toBe(150000n);expect(budget.rootAvailable).toBe(0n);
    await expect(new MandateReader(pc,84532,wallet,{...reader.tokenDomain,chainId:84532}).verifyContext()).rejects.toThrow("CHAIN_MISMATCH");
    await expect(new MandateReader(pc,31337,wallet,{...reader.tokenDomain,name:"Wrong Token"}).verifyContext()).rejects.toThrow("TOKEN_DOMAIN_MISMATCH");
  } finally {node.stop();}
});
