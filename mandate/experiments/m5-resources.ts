import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createPublicClient,http,type Address} from "viem";
import {baseSepolia} from "viem/chains";
import {tokenReadAbi} from "../sdk/reader.js";
const accounts=JSON.parse(readFileSync("artifacts/test-accounts.json","utf8")),config=JSON.parse(readFileSync(".runtime/m3/84532-config.json","utf8"));
const pc=createPublicClient({chain:baseSepolia,transport:http(config.rpc,{timeout:20000,retryCount:0})}),block=await pc.getBlock();
const roles=await Promise.all(Object.entries({...accounts.addresses,formalWallet:config.wallet}).map(async([role,address])=>({role,address,nativeBalanceWei:String(await pc.getBalance({address:address as Address,blockNumber:block.number!})),usdcBalanceAtomic:String(await pc.readContract({address:config.asset,abi:tokenReadAbi,functionName:"balanceOf",args:[address as Address],blockNumber:block.number!}))})));
const result={observedAt:new Date().toISOString(),chainId:await pc.getChainId(),block:String(block.number),blockHash:block.hash,roles,submittedTransactions:0};mkdirSync("artifacts/m5",{recursive:true});writeFileSync("artifacts/m5/resources.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({chainId:result.chainId,walletUSDC:roles.find(r=>r.role==="formalWallet")?.usdcBalanceAtomic,roleBalances:roles.map(r=>({role:r.role,nativeBalanceWei:r.nativeBalanceWei})),submittedTransactions:0}));
