import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {createPublicClient,http} from "viem";
export const TEST_MNEMONIC="test test test test test test test test test test test junk";
export async function startAnvil(options:{timestamp?:number}={}){
  if(options.timestamp!==undefined&&(!Number.isSafeInteger(options.timestamp)||options.timestamp<1))throw Error("ANVIL_TIMESTAMP_INVALID");
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const address=socket.address();if(!address||typeof address==="string")throw new Error("ANVIL_PORT_UNAVAILABLE");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
  const child=spawn("anvil",["--host","127.0.0.1","--port",String(port),"--chain-id","31337","--hardfork","prague","--silent","--mnemonic",TEST_MNEMONIC,...options.timestamp===undefined?[]:["--timestamp",String(options.timestamp)]],{stdio:"ignore"});const rpc=`http://127.0.0.1:${port}`,pc=createPublicClient({transport:http(rpc,{timeout:500,retryCount:0})});
  child.once("error",()=>{});
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error("ANVIL_EXITED");try{if(await pc.getChainId()===31337)return {rpc,stop:()=>{child.kill("SIGTERM");}};}catch{}await new Promise(r=>setTimeout(r,50));}
  child.kill("SIGTERM");throw new Error("ANVIL_START_FAILED");
}
