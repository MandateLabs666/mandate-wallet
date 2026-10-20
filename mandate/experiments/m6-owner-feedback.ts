// Controlled provider error/UI probe; not native-wallet or human usability acceptance.
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash,randomBytes} from "node:crypto";
import {encodeFunctionData} from "viem";
import {localEnvironment} from "../examples/local-environment.js";
import {GatewayTools} from "../gateway/tools.js";
import {MandateWorkspace} from "../sdk/workspace.js";
import {serveWorkspace} from "../web/server.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";

process.umask(0o077);
const revision=process.argv[2];if(!revision||!/^[a-z0-9-]+$/.test(revision))throw Error("FRESH_REVISION_REQUIRED");
const out=resolve(".runtime/owner-feedback",revision);if(existsSync(out))throw Error("REVISION_EXISTS");mkdirSync(out,{recursive:true,mode:0o700});
const save=(p:string,v:unknown)=>writeFileSync(join(out,p),JSON.stringify(v,(_,x)=>typeof x==="bigint"?String(x):x,2)+"\n");
const sourceFingerprint=Object.fromEntries(["mandate/web/app.ts","mandate/web/static/app.html","mandate/experiments/m6-owner-feedback.ts"].map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")]));
const web=join(out,"web");mkdirSync(web);for(const name of ["index.html","app.html","docs.html","styles.css","favicon.svg"])writeFileSync(join(web,name),readFileSync("mandate/web/static/"+name));
const fromTsx=createRequire(import.meta.resolve("tsx")),esbuild=fromTsx("esbuild");if(fromTsx("esbuild/package.json").version!=="0.27.7")throw Error("PINNED_BUILDER_MISMATCH");
await esbuild.build({entryPoints:["mandate/web/app.ts"],outfile:join(web,"app.js"),bundle:true,platform:"browser",format:"esm",target:"es2022",minify:true});
const runtime=process.env.RUNTIME_NODE_MODULES;if(!runtime)throw Error("OPTIONAL_BROWSER_RUNTIME_REQUIRED");const {chromium}=createRequire(join(runtime,"x.cjs"))("playwright");
const e=await localEnvironment(),workspace=await MandateWorkspace.create(new GatewayTools(e.clients[0]));let browser:any,server:Awaited<ReturnType<typeof serveWorkspace>>|undefined;
try{
  const token=randomBytes(32).toString("hex");server=await serveWorkspace(workspace,{staticDirectory:web,authenticate:t=>{if(t!==token)throw Error("TEST_AUTH_REQUIRED");}});
  browser=await chromium.launch({channel:"chromium",headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
  let code:number|undefined,signingCalls=0;const calls:string[]=[];
  await page.exposeFunction("feedbackProviderRequest",async(args:{method:string})=>{calls.push(args.method);if(args.method==="eth_requestAccounts"&&code!==undefined)return {errorCode:code};if(["eth_requestAccounts","eth_accounts"].includes(args.method))return {value:[e.owner.address]};if(args.method==="eth_chainId")return {value:"0x7a69"};signingCalls++;throw Error("FEEDBACK_PROBE_MUST_NEVER_SIGN");});
  await page.addInitScript('window.ethereum={request:async(args)=>{const r=await window.feedbackProviderRequest(args);if(r.errorCode!==undefined)throw Object.assign(Error("Controlled provider error"),{code:r.errorCode});return r.value;}};');
  await page.goto(server.origin+"/app.html");await page.locator("#credential").fill(token);await page.locator("#connection-form button").click();await page.locator("#content .metric-grid").waitFor();
  const draft=async()=>{const response=page.waitForResponse((r:any)=>r.url().endsWith("/api/workspace")&&r.request().postDataJSON()?.operation==="owner-action");await page.locator('[data-action="pause"]').first().click();const r=await response;if(r.status()!==200)throw Error("PAUSE_DRAFT_FAILED");await page.locator("#review").waitFor();return r.json();};
  const stateRow=async(name:string)=>page.locator("#review-fields > div").filter({has:page.locator("span").filter({hasText:new RegExp("^"+name+"$")})}).locator("b").innerText();
  const nonceBefore=await e.pc.getTransactionCount({address:e.owner.address}),cashBefore=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]});
  const pause=await draft(),pauseSummary={current:await stateRow("Current policy state"),requested:await stateRow("Requested policy state"),version:await stateRow("Policy version")};
  if(pause.input.paused!==true||pauseSummary.current!=="Unpaused"||pauseSummary.requested!=="Paused"||pauseSummary.version!=="1 → 2")throw Error("PAUSE_REVIEW_AMBIGUOUS");
  const cases:any[]=[];
  const expected:Record<number,string>={4001:"Signature cancelled",4100:"not authorized",4200:"does not support",4900:"wallet is disconnected",4901:"cannot access the requested network"};
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});
    for(const n of [4001,4100,4200,4900,4901]){
      code=undefined;await page.locator("#connect-review-owner").click();await page.waitForFunction(()=>!document.getElementById("approve")!.hasAttribute("disabled"));
      code=n;await page.locator("#connect-review-owner").click();await page.locator("#review-error").filter({hasText:expected[n]}).waitFor();
      const rect=await page.locator("#review-error").boundingBox();if(!rect||rect.y<0||rect.y+rect.height>900||rect.x<0||rect.x+rect.width>width||!await page.locator("#approve").isDisabled())throw Error("FEEDBACK_OR_AUTHORITY_STATE_INCORRECT");
      cases.push({code:n,width,height:900,text:await page.locator("#review-error").innerText(),rect,approveDisabled:true});
    }
    await page.screenshot({path:join(out,`provider-errors-${width}.png`)});
  }
  const nonceAfterErrors=await e.pc.getTransactionCount({address:e.owner.address});if(nonceAfterErrors!==nonceBefore||signingCalls!==0)throw Error("ERROR_PROBE_SIGNED_OR_CHANGED_NONCE");
  await page.locator("#close-review").click();
  // Explicit trusted fixture setup, separately counted; the UI never signs here.
  const setup=await e.send(e.wallet,encodeFunctionData({abi:accountAbi,functionName:"setPaused",args:[e.root,true]}));
  const refreshed=page.waitForResponse((r:any)=>r.url().endsWith("/api/workspace")&&r.request().postDataJSON()?.operation==="snapshot");await page.locator("#refresh").click();await refreshed;await page.locator('[data-action="pause"]').filter({hasText:"Unpause"}).first().waitFor();
  const unpause=await draft(),unpauseSummary={current:await stateRow("Current policy state"),requested:await stateRow("Requested policy state"),version:await stateRow("Policy version")};
  if(unpause.input.paused!==false||unpauseSummary.current!=="Paused"||unpauseSummary.requested!=="Unpaused"||unpauseSummary.version!=="2 → 3")throw Error("UNPAUSE_REVIEW_AMBIGUOUS");
  await page.screenshot({path:join(out,"unpause-review-390.png")});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:join(out,"unpause-review-1280.png")});
  const nonceAfter=await e.pc.getTransactionCount({address:e.owner.address}),cashAfter=await e.pc.readContract({address:e.asset,abi:testTokenAbi,functionName:"balanceOf",args:[e.wallet]}),payments=await e.pc.getLogs({address:e.asset,event:testTokenAbi.find(a=>a.type==="event"&&a.name==="AuthorizationUsed") as any,fromBlock:0n,toBlock:"latest"});
  if(nonceAfter!==nonceBefore+1||cashBefore!==cashAfter||payments.length!==0||signingCalls!==0)throw Error("UNEXPECTED_FINANCIAL_CHANGE");
  save("result.json",{schemaVersion:1,mode:"controlled EIP-1193 provider feedback and pause/unpause review probe",nativeWallet:false,humanUsability:false,chainId:31337,cases,pauseSummary,unpauseSummary,ownerNonceBefore:nonceBefore,ownerNonceAfterErrors:nonceAfterErrors,ownerNonceAfterSetup:nonceAfter,fixtureSetupTransactions:1,fixtureSetupHash:setup.transactionHash,uiSigningCalls:signingCalls,providerMethods:[...new Set(calls)],tokenPayments:payments.length,walletCashBefore:cashBefore,walletCashAfter:cashAfter,sourceFingerprint,newPublicTransactions:0});
  console.log(JSON.stringify({feedbackCases:cases.length,pauseAndUnpauseExplicit:true,uiSigningCalls:0,newPublicTransactions:0}));
}catch(error){save("failure.json",{code:(error as Error).message,newPublicTransactions:0});throw error;}
finally{await browser?.close();await server?.close();await e.close();}
