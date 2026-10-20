import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createServer} from "node:net";
import {toHex,type Address,type HDAccount} from "viem";
export async function launchExampleMerchant(input:{directory:string;rpc:string;asset:Address;wallet:Address;quote:HDAccount;payer:HDAccount;failAfterPayment?:boolean}){
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const address=socket.address();if(!address||typeof address==="string")throw new Error("MERCHANT_PORT_UNAVAILABLE");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
  for(const [name,account] of [["quote",input.quote],["facilitator",input.payer]] as const)writeFileSync(join(input.directory,name+".json"),JSON.stringify({privateKey:toHex(account.getHdKey().privateKey!)}),{mode:0o600});
  const config=join(input.directory,"merchant-config.json");writeFileSync(config,JSON.stringify({schemaVersion:1,chainId:31337,rpc:input.rpc,asset:input.asset,allowedWallets:[input.wallet],quoteKeyFile:"quote.json",facilitatorKeyFile:"facilitator.json",storeFile:"merchant-process.sqlite",facilitatorStoreFile:"facilitator-process.sqlite",evmFeeReservationCapWei:"1000000000000000",port,confirmations:1,failAfterPayment:input.failAfterPayment??false}),{mode:0o600});
  const child=spawn(process.execPath,["--import","tsx","mandate/examples/controlled-merchant.ts","--config",resolve(config)],{stdio:["ignore","pipe","pipe"],env:{PATH:process.env.PATH??""}});
  await new Promise<void>((resolve,reject)=>{let buffer="";const timer=setTimeout(()=>{child.kill("SIGTERM");reject(new Error("MERCHANT_START_TIMEOUT"));},15000);child.stdout.on("data",d=>{buffer+=d.toString();if(buffer.includes('"origin"')){clearTimeout(timer);resolve();}});child.stderr.on("data",()=>{});child.once("error",()=>{clearTimeout(timer);reject(new Error("MERCHANT_START_FAILED"));});child.once("exit",()=>{clearTimeout(timer);reject(new Error("MERCHANT_EXITED"));});});
  return {origin:`http://127.0.0.1:${port}`,close:async()=>{if(child.exitCode!==null)return;child.kill("SIGTERM");await new Promise<void>(r=>child.once("exit",()=>r()));}};
}
