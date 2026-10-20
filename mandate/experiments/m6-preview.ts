import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {keccak256,createTestClient,http} from "viem";
import {fixture} from "../services/test/fixture.js";
import {GatewayTools} from "../gateway/tools.js";
import {PurchaseClient} from "../services/client.js";
import {EvidenceJournal} from "../evidence/journal.js";
import {PurchaseEvidenceRecorder} from "../evidence/recorder.js";
import {MandateWorkspace} from "../sdk/workspace.js";
import {serveWorkspace} from "../web/server.js";
import {authenticateCredential} from "../gateway/runtime.js";
process.umask(0o077);
// Public fixture credential only. It has no relationship to testnet profiles.
const credential="LOCAL_EVM_TEST_CONNECTION_"+"x".repeat(32),digest=createHash("sha256").update(credential).digest("hex");
const e=await fixture({signedOffersAndReceipts:true,failAfterPayment:true}),journal=new EvidenceJournal(join(e.directory,"evidence.sqlite")),purchase=new PurchaseClient(e.context(0),e.reader,e.transactions,e.http,e.store,new PurchaseEvidenceRecorder(journal,e.reader,e.context(0))),workspace=await MandateWorkspace.create(new GatewayTools(purchase),{schemaVersion:1,chainId:31337,wallet:e.wallet,asset:e.asset,owner:e.owner.address,walletRuntimeHash:keccak256((await e.pc.getCode({address:e.wallet}))!),rpcs:[e.node.rpc],disclosurePolicy:{request:true,result:true}});
const server=await serveWorkspace(workspace,{authenticate:t=>authenticateCredential(digest,t),staticDirectory:"mandate/web/dist",port:18742});
// A long-lived local preview needs current block time for signed offer windows.
// Mining an empty block never renews a policy or grants additional permission.
const localClock=createTestClient({mode:"anvil",transport:http(e.node.rpc)}),clock=setInterval(()=>{void localClock.mine({blocks:1}).catch(()=>console.error(JSON.stringify({code:"LOCAL_PREVIEW_CLOCK_UNAVAILABLE"})));},15000);clock.unref();
mkdirSync(".runtime/m6",{recursive:true,mode:0o700});writeFileSync(".runtime/m6/preview.json",JSON.stringify({pid:process.pid,origin:server.origin,credential,mode:"local-EVM-test",wallet:e.wallet,owner:e.owner.address,taskId:e.root,sourceFingerprint:Object.fromEntries(["mandate/sdk/workspace.ts","mandate/sdk/owner-wallet.ts","mandate/web/server.ts","mandate/gateway/owner-status.ts","mandate/sdk/reader.ts","mandate/web/dist/app.js"].map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))},null,2),{mode:0o600});
console.log(JSON.stringify({origin:server.origin,mode:"local-EVM-test",fixtureCredential:"documented public test constant",ownerWalletProvider:"none; use the SDK test harness for signing"}));
let closing=false;const stop=async()=>{if(closing)return;closing=true;clearInterval(clock);await server.close();journal.close();await e.close();};process.once("SIGTERM",()=>{void stop();});process.once("SIGINT",()=>{void stop();});
