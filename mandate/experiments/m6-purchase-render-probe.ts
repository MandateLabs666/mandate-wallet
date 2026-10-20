// Separate adversarial rendering probe. Altered API responses are not chain evidence.
import {createRequire} from "node:module";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash,randomBytes} from "node:crypto";
import {localEnvironment} from "../examples/local-environment.js";
import {GatewayTools} from "../gateway/tools.js";
import {MandateWorkspace} from "../sdk/workspace.js";
import {serveWorkspace} from "../web/server.js";
process.umask(0o077);
const revision=process.argv[2];if(!revision||!/^[a-z0-9-]+$/.test(revision))throw Error("FRESH_REVISION_REQUIRED");
const out=resolve(".runtime/purchase-render",revision);if(existsSync(out))throw Error("REVISION_EXISTS");mkdirSync(out,{recursive:true,mode:0o700});
const runtime=process.env.RUNTIME_NODE_MODULES;if(!runtime)throw Error("OPTIONAL_BROWSER_RUNTIME_REQUIRED");const {chromium}=createRequire(join(runtime,"x.cjs"))("playwright");
const fromTsx=createRequire(import.meta.resolve("tsx")),esbuild=fromTsx("esbuild"),web=join(out,"web");mkdirSync(web);
if(fromTsx("esbuild/package.json").version!=="0.27.7")throw Error("PINNED_BUILDER_REQUIRED");
for(const n of ["app.html","index.html","docs.html","styles.css","favicon.svg"])writeFileSync(join(web,n),readFileSync("mandate/web/static/"+n));
await esbuild.build({entryPoints:["mandate/web/app.ts"],outfile:join(web,"app.js"),bundle:true,platform:"browser",format:"esm",target:"es2022",minify:true});
const e=await localEnvironment(),workspace=await MandateWorkspace.create(new GatewayTools(e.clients[0]));let browser:any,server:Awaited<ReturnType<typeof serveWorkspace>>|undefined;
try{
  const token=randomBytes(32).toString("hex");server=await serveWorkspace(workspace,{staticDirectory:web,authenticate:t=>{if(t!==token)throw Error("AUTH_REQUIRED");}});browser=await chromium.launch({channel:"chromium",headless:true});
  const control=await browser.newPage();await control.setContent('<img src="invalid-test-source" onerror="window.__purchaseXss=1">');await control.waitForFunction(()=>(window as any).__purchaseXss===1);await control.close();
  const page=await browser.newPage(),payload='<img src="invalid-test-source" onerror="window.__purchaseXss=1">';let altered=0;
  await page.route("**/api/workspace",async(route:any)=>{
    const request=route.request().postDataJSON();if(request.operation!=="connect")throw Error("RENDER_PROBE_MUST_NOT_MUTATE");
    const response=await route.fetch(),body=await response.json();body.task.description=payload;body.services[0].url="https://example.invalid/"+payload;body.services[0].serviceId='">'+payload;
    body.context.policy.occupied="10000";
    body.state.records=[{stepId:body.services[0].stepId,paymentState:"paid",serviceState:"failed",resultState:"unchecked",payment:{value:"10000"},settlementHash:payload,errorCode:payload}];
    const headers={...response.headers()};delete headers["content-length"];altered++;await route.fulfill({response,headers,body:JSON.stringify(body)});
  });
  const before=await e.reader.readBudget(e.root,e.sessions[0]),nonce=await e.pc.getTransactionCount({address:e.operator.address});
  await page.goto(server.origin+"/app.html");await page.locator("#credential").fill(token);await page.locator("#connection-form button").click();await page.locator("#content .metric-grid").waitFor();
  await page.locator('[data-page="services"]').click();const card=page.locator(".service-card").first();await card.waitFor();await card.locator("summary").click();await page.waitForTimeout(250);
  const observed=await page.evaluate(()=>({canary:(window as any).__purchaseXss??0,images:document.querySelectorAll('img[src="invalid-test-source"]').length,provider:Boolean((window as any).ethereum),text:document.querySelector(".service-card")!.textContent!}));
  if(observed.canary!==0||observed.images!==0||observed.provider||!observed.text.includes(payload)||altered!==1)throw Error("HTML_ENCODING_PROBE_FAILED");
  const after=await e.reader.readBudget(e.root,e.sessions[0]);if(after.policy.occupied!==before.policy.occupied||after.policy.occupied!==0n||e.store.all().length!==0||await e.pc.getTransactionCount({address:e.operator.address})!==nonce)throw Error("RENDER_PROBE_CHANGED_REAL_STATE");
  const result={schemaVersion:1,mode:"controlled hostile API text; presentation-only, never financial evidence",positiveControlExecuted:true,appCanaryExecuted:false,unexpectedImageElements:observed.images,literalPayloadVisible:true,alteredReadResponses:altered,providerInjected:false,actualChainOccupancyBefore:String(before.policy.occupied),actualChainOccupancyAfter:String(after.policy.occupied),actualPurchaseRecords:0,operatorNonceBefore:nonce,operatorNonceAfter:nonce,newPublicTransactions:0,sourceFingerprint:Object.fromEntries(["mandate/web/app.ts","mandate/web/purchase-presentation.ts","mandate/experiments/m6-purchase-render-probe.ts"].map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")]))};
  writeFileSync(join(out,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({positiveControlExecuted:true,appCanaryExecuted:false,realStateUnchanged:true,presentationOnly:true}));
}finally{await browser?.close();await server?.close();await e.close();}
