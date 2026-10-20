import {readFileSync,mkdtempSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createPublicClient,createWalletClient,http as rpcHttp,encodeFunctionData,keccak256,toHex,type Abi,type Hex} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {startAnvil,TEST_MNEMONIC} from "./local-node.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {MandateReader} from "../sdk/reader.js";
import {canonicalJson,requestHash} from "../sdk/model.js";
import {PurchaseStore} from "../services/store.js";
import {DurableTransactions} from "../services/transactions.js";
import {controlledFacilitator} from "../services/facilitator.js";
import {startControlledMerchant,expectedStats} from "../services/merchant.js";
import {PurchaseClient,type AgentContext} from "../services/client.js";
import {SafeHttp} from "../services/http.js";
import {launchExampleMerchant} from "./merchant-process.js";
export async function localEnvironment(options:{failAfterPayment?:boolean;priceAtomic?:string;signedOffersAndReceipts?:boolean;standaloneMerchant?:boolean;timestamp?:number;merchantPort?:number;initialWalletCashAtomic?:bigint}={}) {
  const node=await startAnvil({timestamp:options.timestamp}),directory=mkdtempSync(join(tmpdir(),"mandate-m4-"));
  const cleanup:(()=>void|Promise<void>)[]=[()=>{node.stop();}];
  try {
  const chain={id:31337,name:"M4 Anvil",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:{default:{http:[node.rpc]}}};
  const accounts=Array.from({length:6},(_,addressIndex)=>mnemonicToAccount(TEST_MNEMONIC,{addressIndex})),[owner,agentA,agentB,operator,merchantSigner,payer]=accounts;
  const pc=createPublicClient({chain,transport:rpcHttp(node.rpc,{timeout:5000,retryCount:0}),pollingInterval:100}),ownerWallet=createWalletClient({chain,account:owner,transport:rpcHttp(node.rpc)});
  if(options.timestamp!==undefined)await pc.request({method:"anvil_setBlockTimestampInterval" as never,params:[1] as never});
  async function deploy(name:string,args:unknown[]=[]) {const a=JSON.parse(readFileSync(`mandate/contracts/out/${name}.sol/${name}.json`,"utf8"));const hash=await ownerWallet.deployContract({abi:a.abi as Abi,bytecode:a.bytecode.object as Hex,args});return (await pc.waitForTransactionReceipt({hash})).contractAddress!;}
  async function send(to:`0x${string}`,data:Hex){const hash=await ownerWallet.sendTransaction({to,data});return pc.waitForTransactionReceipt({hash});}
  const asset=await deploy("TestUSDC"),wallet=await deploy("MandateAccount",[owner.address,asset]);
  const facilityStore=new PurchaseStore(join(directory,"facilitator.sqlite")),facilityTransactions=new DurableTransactions(pc,createWalletClient({chain,account:payer,transport:rpcHttp(node.rpc)}),facilityStore,10n**18n,1),facilitator=controlledFacilitator(facilityTransactions);
  cleanup.push(()=>facilityStore.close());
  const merchant=options.standaloneMerchant?await launchExampleMerchant({directory,rpc:node.rpc,asset,wallet,quote:merchantSigner,payer,failAfterPayment:options.failAfterPayment}):await startControlledMerchant({pc,facilitator,chainId:31337,asset,payTo:merchantSigner.address,quoteSigner:merchantSigner,allowedWallets:[wallet],dbPath:join(directory,"merchant.sqlite"),confirmations:1,port:options.merchantPort,...options});
  cleanup.push(()=>merchant.close());
  const root=keccak256(toHex("M4-test-root")),merchantId=keccak256(toHex("merchant")),steps=[keccak256(toHex("eth-step")),keccak256(toHex("btc-step"))],sessions=[keccak256(toHex("agent-a")),keccak256(toHex("agent-b"))];
  const services=["ETH","BTC"].map((symbol,i)=>({stepId:steps[i],serviceId:keccak256(toHex(symbol)),method:"GET" as const,url:`${merchant.origin}/stats?asset=${symbol}`,body:null,checkResult:(result:unknown)=>canonicalJson(result)===canonicalJson(expectedStats(symbol as "ETH"|"BTC"))}));
  const expiry=(await pc.getBlock()).timestamp+3600n;
  const created=await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[root,keccak256(toHex("task")),{budget:150000n,maxPerPayment:100000n,expiresAt:expiry},[{id:merchantId,payTo:merchantSigner.address,quoteSigner:merchantSigner.address}],services.map(s=>({id:s.stepId,merchantId,requestHash:requestHash(s)}))]}));
  for(let i=0;i<2;i++)await send(wallet,encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[root,sessions[i],accounts[i+1].address,150000n,100000n,expiry,steps]}));
  await send(asset,encodeFunctionData({abi:testTokenAbi,functionName:"mint",args:[wallet,options.initialWalletCashAtomic??1000000n]}));
  const storePath=join(directory,"purchases.sqlite"),store=new PurchaseStore(storePath),transactions=new DurableTransactions(pc,createWalletClient({chain,account:operator,transport:rpcHttp(node.rpc)}),store,10n**18n,1),reader=new MandateReader(pc,31337,wallet,{name:"USDC",version:"2",chainId:31337,verifyingContract:asset});
  const http=new SafeHttp({testLoopbackOrigins:[merchant.origin],allowOrigins:[merchant.origin],timeoutMs:10000});
  cleanup.push(()=>store.close());
  const context=(i:number):AgentContext=>({agentId:i===0?"agent-a":"agent-b",mandateId:root,sessionId:sessions[i],signer:accounts[i+1],services,startBlock:created.blockNumber});
  const clients=[new PurchaseClient(context(0),reader,transactions,http,store),new PurchaseClient(context(1),reader,transactions,http,store)];
  return {node,directory,chain,owner,agentA,agentB,operator,merchantSigner,pc,wallet,asset,root,sessions,steps,services,store,storePath,transactions,reader,http,clients,facilitator,facilityStore,context,send,merchant,
    close:async()=>{for(const close of [...cleanup].reverse())await close();}};
  }catch(error){for(const close of [...cleanup].reverse()){try{await close();}catch{}}throw error;}
}
