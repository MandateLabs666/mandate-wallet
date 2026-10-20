import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {homedir} from "node:os";
import {spawn} from "node:child_process";
import {type PublicNetwork} from "./engine.js";
import {SetupProfiles} from "./profiles.js";
import {serveSetup} from "./server.js";
async function main(){
 process.umask(0o077);const args=process.argv.slice(2),flags:Record<string,string>={};let open=false;
 while(args.length){const key=args.shift()!;if(key==="--open"){open=true;continue;}if(!["--directory","--port","--project","--home","--import-profile","--connection-file"].includes(key)||!args.length||flags[key])throw Error("SETUP_ARGUMENT_INVALID");flags[key]=args.shift()!;}
 const versions=JSON.parse(readFileSync("mandate/sdk/VERSIONS.json","utf8")),nets=JSON.parse(readFileSync("mandate/networks/networks.json","utf8"));
 const networks:PublicNetwork[]=versions.networks.map((v:any)=>{const n=nets.networks.find((n:any)=>n.chainId===v.chainId);return {chainId:n.chainId,name:n.name,rpc:n.rpc,asset:v.contracts.TestUSDC?.address??n.nativeUSDC,factory:v.contracts.MandateFactory.address,factoryHash:v.contracts.MandateFactory.runtimeHash};});
 const engine=new SetupProfiles({directory:flags['--directory']??'.runtime/mandate-setup',project:resolve(flags['--project']??'.'),home:flags['--home']??homedir(),entry:resolve('.runtime/claude-desktop-guide/package/server/mandate-desktop.cjs'),packageDirectory:resolve('.runtime/claude-desktop-guide/package'),networks});
 let recovery:string|undefined;
 try{await engine.restore();if(flags['--import-profile']&&flags['--connection-file'])await engine.importExisting(flags['--import-profile'],flags['--connection-file']);}catch{recovery='Original setup retained; its RPC or fixed profile needs recovery. No new wallet was created.';}
 const server=await serveSetup(engine,{port:Number(flags['--port']??18743),staticDirectory:resolve('mandate/web/dist')});
 console.log(JSON.stringify({origin:server.origin,setup:server.origin+'/setup.html',ownerKeyLoaded:false,recovery:recovery??null}));
 if(open&&process.platform==='darwin')spawn('open',[server.origin+'/setup.html'],{stdio:'ignore'}).once('error',()=>{});
 let closing=false;const close=async()=>{if(closing)return;closing=true;await server.close();await engine.close();};process.once('SIGTERM',()=>{void close();});process.once('SIGINT',()=>{void close();});
}
void main().catch(()=>{process.stderr.write('{"code":"SETUP_START_FAILED"}\n');process.exitCode=1;});
