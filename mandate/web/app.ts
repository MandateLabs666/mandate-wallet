import {presentPurchase,purchaseErrorMessage,type PurchaseView} from "./purchase-presentation.js";
import {parseUSDC,type MandateError} from "../sdk/model.js";
import {formatUSDC,budgetPresentation} from "../sdk/presentation.js";
import {connectOwner,describeOwnerDraft,ownerInputFromDraft,submitOwnerDraft,type OwnerProvider,type OwnerSubmission} from "../sdk/owner-wallet.js";
import {bootLanding} from "./landing.js";
import {WorkspaceGuide} from "./guidance.js";
import {workspaceStatus} from "./guidance-model.js";
import {bootI18n} from "./i18n.js";
import {bootWalkthrough} from "./walkthrough.js";
import {transactionExplorerURL} from "./explorer.js";
declare global{interface Window{ethereum?:OwnerProvider}}
bootI18n();
if(document.body.classList.contains("landing"))bootLanding();
else if(document.body.classList.contains("walkthrough"))bootWalkthrough();
else if(document.body.classList.contains("workspace")) {
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v,2);
const button=(label:string,action:string,id="",secondary=false,disabled=false)=>`<button class="button${secondary?" secondary":""}" data-action="${action}" data-id="${esc(id)}"${disabled?" disabled":""}>${esc(label)}</button>`;
const row=(name:string,value:unknown)=>`<div><span>${esc(name)}</span><b${name==="Task goal"?' translate="no"':""}>${esc(value)}</b></div>`;
const notice=(text:string)=>`<p class="notice">${esc(text)}</p>`;
const names:Record<string,string>={overview:"Overview",tasks:"Tasks",mandates:"Mandates",services:"Services",payments:"Payments",evidence:"Evidence",security:"Security"};
let token="",apiOrigin="",snapshot:any,review:any,formAction="create",ownerConnected=false;
let connectionEpoch=0,snapshotGeneration=0,ownerConnectionGeneration=0;
const ownerOperations=new Set<string>(),purchaseOperations=new Set<string>();
const guideQuotes=new Map<string,{serviceId:string;display:string}>(),guideServices=new Map<string,string>(),guideChecks=new Map<string,{taskId:string;serviceId:string;overall:string;requiredChecksPassed:boolean}>();
const guideKey=()=>snapshot?`${connectionEpoch}/${snapshot.task.id}/${snapshot.context.policy.version}/${snapshot.context.sessionId}`:"";
const guideService=()=>guideServices.get(guideKey())??snapshot?.services[0]?.serviceId;
const localDemo=location.protocol==="http:"&&location.hostname==="127.0.0.1";
const fixtureCredential="LOCAL_EVM_TEST_CONNECTION_"+"x".repeat(32);
const fixturePreview=()=>Boolean(snapshot?.dataMode==="local-EVM-test"&&apiOrigin===location.origin&&token===fixtureCredential);
const guidance=new WorkspaceGuide(()=>({snapshot,ownerConnected,localDemo,fixturePreview:fixturePreview(),connectionEpoch,activeService:guideService(),reviewOpen:el<HTMLDialogElement>("review").open,ownerBusy:Boolean(review&&ownerOperations.has(pendingKey(review.request.requestId))),purchaseBusy:Boolean(snapshot&&purchaseOperations.has(purchaseKey(snapshot.task.id,guideService()))),quotedService:guideQuotes.get(guideKey())?.serviceId,verification:guideChecks.get(guideKey()+"/"+guideService())}),next=>{if(page()!==next)location.hash=next;},id=>{guideServices.set(guideKey(),id);guidance.update();});
const purchaseKey=(task:string,service:string)=>`${connectionEpoch}/${task}/${service}`;
type Connection={origin:string;token:string};
const connection=():Connection=>({origin:apiOrigin,token});
const pendingKey=(id:string)=>`mandate-owner-v2/${snapshot.context.chainId}/${snapshot.context.wallet.toLowerCase()}/${id}`;
const friendly:Record<string,string>={WALLET_WRONG_NETWORK:"Your wallet is on a different network. Select the workspace testnet, then reconnect.",WALLET_WRONG_OWNER:"Connect the owner address shown in this workspace.",WALLET_ACCOUNT_CHANGED:"The selected account changed. Reconnect the owner wallet.",OWNER_SUBMISSION_RECONCILE_FIRST:"This request may already be submitted. Reconcile it before attempting another signature.",GRANT_EXCEEDS_OWNER_POLICY:"The session budget, limit or expiry exceeds the root policy. Review a smaller grant or replace the policy first.",BUDGET_BELOW_OCCUPANCY:"The new budget cannot be smaller than occupied commitments.",WORKSPACE_CONTROLLER_RECONFIGURATION_REQUIRED:"This task uses a fixed controller envelope. A trusted administrator must configure a new owner-approved envelope before changing sessions.",WEB_OPERATION_UNAVAILABLE:"The operation could not be confirmed. Refresh or reconcile the same request; do not create a replacement payment.",OWNER_ACTION_SIMULATION_FAILED:"The requested change does not currently simulate successfully. Refresh the policy and check its version, pause, expiry and revocation before signing.",TOOL_CONNECTION_UNAUTHENTICATED:"The connection credential is missing or expired. Obtain the configured credential from your local administrator."};
Object.assign(friendly,{"4100":"This site is not authorized by your wallet. Reconnect the owner wallet and approve site access.","4200":"This wallet does not support the requested method. Use a compatible EIP-1193 wallet.","4900":"Your wallet is disconnected. Restore its connection, then reconnect the owner wallet.","4901":"Your wallet cannot access the requested network. Select the workspace testnet, then reconnect.",OWNER_REQUEST_IN_PROGRESS:"This request is still waiting for the wallet or reconciliation. Check the pending wallet request before continuing.",WEB_GATEWAY_CONNECTION_UNAVAILABLE:"Start your trusted local Gateway at the address above. For the hosted App, check local or loopback network access in this site's browser settings, then retry. You can also open the Gateway's /app.html page on this computer."});
function message(error:unknown){const code=(error as any)?.code??(error as Error)?.message??"UNKNOWN_ERROR";return code===4001?"Signature cancelled. No permission was activated.":friendly[String(code)]??purchaseErrorMessage(String(code),snapshot)??String(code);}
async function api(operation:string,args:Record<string,unknown>={},session=connection()){
  let response:Response;
  const profile=new URLSearchParams(location.search).get('profile');
  try{response=await fetch(session.origin+"/api/workspace",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.token,...(session.origin===location.origin&&profile&&/^[a-f0-9]{32}$/.test(profile)?{'X-Mandate-Profile':profile}:{})},body:json({operation,...args})});}
  catch{throw new Error(operation==="connect"?"WEB_GATEWAY_CONNECTION_UNAVAILABLE":"WEB_OPERATION_UNAVAILABLE");}
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.code),{code:data.code});return data;
}
function taskId(){return snapshot.task.id;}
async function refresh(id=taskId()){const epoch=connectionEpoch,generation=++snapshotGeneration,next=await api("snapshot",{taskId:id});if(epoch!==connectionEpoch||generation!==snapshotGeneration)return;snapshot=next;render();}
function page(){const selected=location.hash.slice(1);return Object.hasOwn(names,selected)?selected:"overview";}
function status(){return workspaceStatus(snapshot);}
function records(){return snapshot.state.records as any[];}
function transactionRow(name:string,hash:unknown,fallback:string){
 const url=transactionExplorerURL(snapshot.context.chainId,hash);
 return url?`<div><span>${esc(name)}</span><b><a class="hash" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="View transaction on explorer">${esc(hash)} ↗</a></b></div>`:row(name,hash??fallback);
}
function actions(){if(fixturePreview())return `<p class="notice">This preset test account has no owner signer in the browser. Use the walkthrough to explore approval and revocation, or connect your own workspace for owner actions.</p><div class="action-row"><a class="button" href="walkthrough.html">Watch the complete flow</a>${button("Connect my own Gateway","disconnect","",true)}</div>`;return `<div class="action-row">${button("New task","new")}${button("Edit limits / restore policy","replace","",true)}${button("Grant finite session","grant","",true)}${button(snapshot.context.policy.paused?"Unpause (scope needs restoration)":"Pause","pause","",true)}${button("Revoke session","revokeSession","",true)}${button("Revoke mandate","revoke","",true)}</div>`;}
function purchaseAction(record:PurchaseView|undefined,serviceId:string){
  const view=presentPurchase(record,snapshot),busy=purchaseOperations.has(purchaseKey(taskId(),serviceId));
  return view.action==="run"?button(busy?"Checking original step…":view.label,"run",serviceId,false,busy):button(view.label,"view",view.action,true);
}
function purchaseCard(service:any){
  const record=records().find(r=>r.stepId===service.stepId),view=presentPurchase(record,snapshot);
  const states=record?row("Payment",record.paymentState)+row("Service",record.serviceState)+row("Result",record.resultState):row("Payment","Not started")+row("Service","Not requested")+row("Result","Unchecked");
  const original=record?.payment?`<div class="rule-list">${row("Original amount",formatUSDC(record.payment.value)+" USDC")}${transactionRow("Settlement",record.settlementHash,"Not confirmed")}</div>`:"";
  const lastQuote=guideQuotes.get(guideKey());
  const quote=record?.payment?"":`<div id="quote-${esc(service.serviceId)}" class="quote-result quiet">${esc(lastQuote&&lastQuote.serviceId===service.serviceId?lastQuote.display:"Fetch the latest 402 terms before registration.")}</div>`;
  const actionNote=record?.paymentState==="paid"?"This step is already paid. Recover or inspect its original order; do not pay for it again.":record?.payment?"Reconcile the original commitment before any new payment.":"Checking a quote does not pay. Running the approved step may use its existing authorization.";
  return `<article class="panel service-card" id="purchase-${esc(service.serviceId)}" data-service-id="${esc(service.serviceId)}"><p class="eyebrow">OWNER-CONFIGURED SERVICE</p><h2>${esc(service.url.includes("ETH")?"ETH":service.url.includes("BTC")?"BTC":"Approved")} statistics</h2><p class="hash quiet">${esc(service.method)} ${esc(service.url)}</p>${quote}<div class="action-row service-actions">${record?.payment?"":button("Check latest quote","quote",service.serviceId,true)}${purchaseAction(record,service.serviceId)}</div><p class="service-action-note">${esc(actionNote)}</p><div class="rule-list" data-purchase-status aria-label="Purchase outcomes">${states}</div><p class="notice${record&&!(record.paymentState==="paid"&&record.serviceState==="returned"&&record.resultState==="valid")||view.action==="mandates"?" warning":""}" data-purchase-guidance>${esc(view.text)}</p>${original}${record?.errorCode?`<details><summary>Recorded reason code</summary><p class="hash quiet">${esc(record.errorCode)}</p></details>`:""}</article>`;
}
function render(){
  if(!snapshot)return;const current=page(),c=snapshot.context,p=c.policy,g=c.grant,all=records(),budget=budgetPresentation(p,all);
  el("connection-panel").hidden=true;el("data-mode").textContent=snapshot.dataMode==="local-EVM-test"?"Local EVM + HTTP · controlled test fixture":"Public testnet · live chain snapshot";
  el("network").textContent=c.chainId===84532?"Base Sepolia":c.chainId===11155111?"Ethereum Sepolia":"Anvil · local test";el("source-block").textContent=`Block ${snapshot.observedBlock} · ${new Date(Number(snapshot.observedAt)*1000).toISOString()} · 6-decimal USDC`;
  el("breadcrumb").textContent=names[current];el<HTMLButtonElement>("refresh").disabled=false;el<HTMLButtonElement>("connect-owner").disabled=false;
  el("connect-owner").hidden=fixturePreview();
  document.querySelectorAll("[data-page]").forEach(e=>e.classList.toggle("active",e.getAttribute("data-page")===current));
  let content=`<div class="page-title"><div><p class="eyebrow">OWNER WORKSPACE</p><h1>${names[current]}</h1><p><span translate="no">${esc(snapshot.task.description)}</span> · <span>${esc(status())}</span></p></div><span class="tag ${status()==="Active"?"teal":"amber"}">${esc(status())}</span></div>`;
  if(fixturePreview()&&["services","payments","evidence"].includes(current))content+=`<aside class="fixture-inline"><span class="tag amber">Preset local test account</span><p>This preset task only runs while its finite approval is active. New owner permissions require your own workspace.</p><a href="walkthrough.html">Watch the complete flow</a></aside>`;
  else if(fixturePreview())content+=`<aside id="fixture-help" class="panel fixture-help"><div><span class="tag amber">Preset local test account</span><h2>Understand the flow before using a wallet</h2><p>This task runs on a local test chain. Its permissions expire, and this browser cannot sign for its preset owner. Connecting your personal wallet does not make you that owner.</p><p>You can inspect or run an existing active task. For the complete approval, purchase, recovery and revocation journey, open the interactive walkthrough. To manage real permissions, connect your own Gateway and its owner wallet.</p></div><div class="action-row"><a class="button" id="fixture-walkthrough" href="walkthrough.html">Watch the complete flow</a>${button("Connect my own Gateway","disconnect","",true)}</div></aside>`;
  const metrics=`<div class="metric-grid"><div class="metric"><span>Confirmed paid in local records</span><strong>${formatUSDC(budget.paidKnown)}</strong><small>USDC</small></div><div class="metric"><span>Total occupied</span><strong>${formatUSDC(budget.occupied)}</strong><small>USDC</small></div><div class="metric"><span>${status()==="Active"?"Available authorization":"Unused budget · permission inactive"}</span><strong>${formatUSDC(budget.available)}</strong><small>USDC</small></div><div class="metric"><span>Actual wallet cash</span><strong>${formatUSDC(c.walletBalanceAtomic)}</strong><small>USDC</small></div></div>`;
  const stateTable=`<div class="table-wrap"><table><thead><tr><th>STEP</th><th>PAYMENT</th><th>SERVICE</th><th>RESULT</th><th>NEXT STEP</th></tr></thead><tbody>${all.length?all.map(r=>`<tr><td class="hash">${esc(r.stepId.slice(0,16))}…</td><td>${esc(r.paymentState)}${r.payment?" · "+formatUSDC(r.payment.value)+" USDC":""}</td><td>${esc(r.serviceState)}</td><td>${esc(r.resultState)}</td><td>${purchaseAction(r,snapshot.services.find((s:any)=>s.stepId===r.stepId)?.serviceId??"")}</td></tr>`).join(""):`<tr><td colspan="5" class="empty">No purchase records for this task. Quote an approved service to begin.</td></tr>`}</tbody></table></div>`;
  if(current==="overview")content+=metrics+notice(`Occupied = paid history + unresolved commitments + other conservative occupancy. Known unresolved: ${formatUSDC(budget.unresolvedKnown)}; other occupied: ${formatUSDC(budget.otherConservativeOccupied)} USDC. Available budget is not a token balance.`)+`<div class="dashboard-grid"><div class="panel"><h2 translate="no">${esc(snapshot.task.description)}</h2><div class="rule-list">${row("Policy version",p.version)}${row("Session epoch",g.epoch)}${row("Per payment",formatUSDC(p.maxPerPayment)+" USDC")}${row("Expiry",p.exists?new Date(Number(p.expiresAt)*1000).toISOString():"Not created")}</div>${actions()}</div><div class="panel"><h2>Permission belongs to the owner.</h2><p class="panel-note hash">${esc(snapshot.owner)}</p><p class="notice">Connecting an agent credential does not activate owner permissions. New mandates need a separate finite session grant.</p><a href="#mandates" class="text-link">Review boundaries →</a></div></div>`+`<div class="subheading"><h2>Execution, with three separate outcomes.</h2></div>`+stateTable;
  if(current==="tasks")content+=`<div class="action-row">${button("Create task","new")}</div><div class="service-grid">${snapshot.tasks.map((t:any)=>`<article class="panel"><p class="eyebrow">${t.id===taskId()?"SELECTED TASK":"CONFIGURED TASK"}</p><h2 translate="no">${esc(t.description)}</h2><p class="hash quiet">${esc(t.id)}</p>${button("Inspect task","select",t.id,true)}</article>`).join("")}</div>`;
  if(current==="mandates")content+=metrics+`<div class="panel"><h2>Owner-approved scope</h2><div class="rule-list">${row("Wallet",c.wallet)}${row("Owner",snapshot.owner)}${row("Mandate",c.mandateId)}${row("Session",c.sessionId)}${row("Session signer",g.signer)}${row("Budget",formatUSDC(p.budget)+" USDC")}${row("Maximum payment",formatUSDC(p.maxPerPayment)+" USDC")}${row("Occupied (retained)",formatUSDC(p.occupied)+" USDC")}</div>${snapshot.task.template.merchants.map((m:any)=>`<p class="quiet hash">Approved recipient ${esc(m.payTo)} · merchant ${esc(m.id)}</p>`).join("")}${notice("Policy replacement and pause change the version. Existing grants become stale; unpausing alone does not restore service scope. Restore the policy and approve a fresh finite grant.")}${actions()}</div><div class="subheading"><h2>Owner requests</h2></div>${snapshot.ownerRequests?.map((r:any)=>`<div class="panel"><div class="row"><b>${esc(r.draft.action)}</b><span class="tag">${esc(r.status)}</span></div><p class="hash quiet">${esc(r.requestId)}</p><p class="quiet">Applied: ${esc(r.actionApplied)} · active task grant: ${esc(r.chainActive)}</p>${button("Review / recover","review-request",r.requestId,true)}${button("Reconcile","owner-status",r.requestId,true)}</div>`).join("")??""}`;
  if(current==="services")content+=notice("Configured services are owner-approved request scope. Bazaar discovery is untrusted metadata and cannot expand this allowlist.")+`<form id="search-form" class="search-row"><label class="field" for="service-query">Explore Bazaar metadata</label><input id="service-query" placeholder="Data, statistics, analytics" maxlength="300" required><button class="button secondary">Search directory</button></form><div id="directory-results"></div><div class="service-grid">${snapshot.services.map(purchaseCard).join("")}</div>`;
  if(current==="payments")content+=metrics+stateTable+notice("A paid service failure is recovered using the original nonce and order. An unknown settlement continues to occupy its budget. Gas is tracked separately from USDC purchases.")+all.map(r=>`<div class="panel"><h2>${esc(r.paymentState)} · ${r.payment?formatUSDC(r.payment.value):"0"} USDC</h2><div class="rule-list">${transactionRow("Registration",r.registrationHash,"Not broadcast")}${transactionRow("Settlement",r.settlementHash,"Not confirmed")}${row("Error",r.errorCode??"None")}</div></div>`).join("");
  if(current==="evidence")content+=notice("Source levels are separate. A local signature or valid Merkle disclosure does not prove HTTPS origin or complete history.")+all.map(r=>`<div class="panel"><h2>Step evidence</h2><div class="rule-list">${row("Evidence status",r.evidenceStatus??"No signed pre-checkpoint")}${row("Pre root",r.preCheckpointRoot??"Not present")}${row("Merchant receipt",r.receiptEvidence?.status??"Not present")}${row("Result",r.resultState)}</div><p class="quiet">Independent verifier checks require a disclosed evidence bundle and separately trusted deployment/authorization configuration. The receipt below is a redacted state projection.</p><div class="disclosure-options"><label><input type="checkbox" id="disclose-request-${esc(r.stepId)}" ${snapshot.evidenceCapabilities?.disclosurePolicy.request?"":"disabled"}> Disclose exact request (admin-approved scope)</label><label><input type="checkbox" id="disclose-result-${esc(r.stepId)}" ${snapshot.evidenceCapabilities?.disclosurePolicy.result?"":"disabled"}> Disclose result body (admin-approved scope)</label></div><div class="action-row">${button("Export evidence bundle","evidence",snapshot.services.find((s:any)=>s.stepId===r.stepId)?.serviceId??"",true)}${button("Run independent checks","check-evidence",snapshot.services.find((s:any)=>s.stepId===r.stepId)?.serviceId??"",true)}${button("Export redacted receipt","receipt",snapshot.services.find((s:any)=>s.stepId===r.stepId)?.serviceId??"",true)}</div><div id="evidence-report-${esc(r.stepId)}"></div></div>`).join("")+(all.length?"":`<div class="panel empty">No purchase evidence yet. Existing public experiments remain in the repository's artifacts/m5 directory.</div>`);
  if(current==="security")content+=`<div class="panel"><h2>Boundaries you can inspect.</h2><div class="rule-list">${row("Owner key in Gateway","No")}${row("RPC consensus proof","No · configured third-party provider")}${row("Payment path","x402 v2 exact / EIP-3009")}${row("Account","Deployed, immutable ERC-1271")}${row("Mainnet payments","Disabled")}</div>${notice("The protocol enforces financial scope and request/quote hashes. It does not enforce the full session root. Independent retained checkpoints are necessary to detect edits to observed history; out-of-band activity remains unproven.")}${notice("Controller/notary processes on the same OS do not provide hostile-host isolation. Use an independently controlled owner wallet and separately managed retention for that boundary.")}${actions()}<button class="text-link" data-action="disconnect">Disconnect credential and owner</button></div>`;
  el("content").innerHTML=content;
  guidance.update();
}
async function openReview(value:any){if(value.request.draft.transaction.chainId!==snapshot.context.chainId||value.request.draft.transaction.to.toLowerCase()!==snapshot.context.wallet.toLowerCase()||value.request.draft.transaction.from.toLowerCase()!==snapshot.owner.toLowerCase())throw new Error("OWNER_REVIEW_CONTEXT_MISMATCH");review=value;const summary=describeOwnerDraft(value.request.draft,value.input),input=value.input,limits=input.limits??(input.action==="grant"?input:undefined);el("review-note").textContent=summary.permissionChange;
  let fields=row("Action",summary.action)+row("Network",summary.chainId)+row("Wallet",summary.wallet)+row("Owner",summary.owner)+row("Native ETH sent","0");
  if(limits)fields+=row("New budget",formatUSDC(limits.budget)+" USDC")+row("New per-payment max",formatUSDC(limits.maxPerPayment)+" USDC")+row("Expires",new Date(Number(limits.expiresAt)*1000).toISOString());
  fields+=row("Budget asset",snapshot.context.asset)+row("Task goal",value.task.description);
  if(input.action==="replace"){
    const before=snapshot.context.policy,increase=BigInt(limits.budget)-BigInt(before.budget);
    fields+=row("Budget change",formatUSDC(before.budget)+" → "+formatUSDC(limits.budget)+" USDC")+row("Per-payment change",formatUSDC(before.maxPerPayment)+" → "+formatUSDC(limits.maxPerPayment)+" USDC")+row("Policy version",before.version+" → "+String(BigInt(before.version)+1n))+row("Old expiry",new Date(Number(before.expiresAt)*1000).toISOString());
    if(increase>0n)fields+=row("Budget increases by",formatUSDC(increase)+" USDC · owner approval required");
  }
  if(input.action==="pause")fields+=row("Current policy state",snapshot.context.policy.paused?"Paused":"Unpaused")+row("Requested policy state",input.paused?"Paused":"Unpaused")+row("Policy version",snapshot.context.policy.version+" → "+String(BigInt(snapshot.context.policy.version)+1n));
  if(input.action==="grant")fields+=row("Session ID",input.sessionId)+row("Shared root available",formatUSDC(snapshot.context.rootAvailable)+" USDC");
  if(snapshot)fields+=row("Current occupied for this mandate",formatUSDC(input.action==="create"?"0":snapshot.context.policy.occupied)+" USDC");
  fields+=row("Network fee","Gas is separate; your wallet estimates it before approval.");
  if(input.steps)fields+=snapshot.services.filter((s:any)=>input.steps.some((step:any)=>(typeof step==="string"?step:step.id)===s.stepId)).map((s:any)=>row("Approved resource",s.method+" "+s.url)).join("");
  if(input.merchants)fields+=input.merchants.map((m:any)=>row("Approved recipient",m.payTo)).join("")+row("Approved steps",input.steps.map((s:any)=>s.id).join(", "));
  if(input.action==="grant")fields+=row("Session signer",input.signer)+row("Approved steps",input.steps.join(", "));
  el("review-fields").innerHTML=fields;el("review-call").textContent=value.request.draft.transaction.data;el("review-error").textContent="";updateApprove();el<HTMLDialogElement>("review").showModal();guidance.update();
}
function openForm(action:string){formAction=action;el("form-kind").textContent=action==="create"?"NEW MANDATE":action==="grant"?"FINITE SESSION":"REPLACE POLICY";el<HTMLInputElement>("task-description").disabled=action!=="create";el<HTMLInputElement>("task-budget").value=action==="create"?"0.15":formatUSDC(snapshot.context.policy.budget);el<HTMLInputElement>("task-max").value=action==="create"?"0.10":formatUSDC(snapshot.context.policy.maxPerPayment);el<HTMLInputElement>("task-ttl").value=action==="grant"?String(Math.max(1,Math.min(30,Math.floor((Number(snapshot.context.policy.expiresAt)-Number(snapshot.observedAt))/60)-1))):"60";el("task-error").textContent="";el<HTMLDialogElement>("task-form").showModal();}
async function run(action:string,id:string){
  if(["quote","run","evidence","check-evidence"].includes(action)&&snapshot.services.some((s:any)=>s.serviceId===id)){guideServices.set(guideKey(),id);guidance.update();}
  if(action==="view"){if(!["mandates","evidence","payments"].includes(id))throw new Error("VIEW_UNSUPPORTED");location.hash=id;return;}
  if(action==="new"||["replace","grant"].includes(action)){openForm(action==="new"?"create":action);return;}
  if(action==="select"){await refresh(id);return;}
  if(action==="quote"){const epoch=connectionEpoch,key=guideKey(),q=await api("quote",{taskId:taskId(),serviceId:id});if(epoch!==connectionEpoch||key!==guideKey())return;const display=`${formatUSDC(q.requirements.amount)} USDC · ${q.requirements.network} · recipient ${q.requirements.payTo} · ${q.evidenceLevel}`;guideQuotes.set(key,{serviceId:id,display});const box=document.getElementById("quote-"+id);if(box)box.textContent=display;guidance.update();return;}
  if(action==="run"){
    if(!id)throw new Error("SERVICE_SCOPE_REVIEW_REQUIRED");const epoch=connectionEpoch,task=taskId(),key=purchaseKey(task,id),session=connection();if(purchaseOperations.has(key))return;
    purchaseOperations.add(key);render();
    try{await api("call",{taskId:task,serviceId:id},session);if(epoch===connectionEpoch&&snapshot?.task.id===task)await refresh(task);}
    catch(error){if(epoch===connectionEpoch&&snapshot?.task.id===task)throw error;}
    finally{purchaseOperations.delete(key);if(epoch===connectionEpoch&&snapshot?.task.id===task){render();if(page()==="services")document.getElementById("purchase-"+id)?.scrollIntoView({block:"nearest"});}}
    return;
  }
  if(action==="evidence"||action==="check-evidence"){
    const service=snapshot.services.find((s:any)=>s.serviceId===id);if(!service)throw new Error("SERVICE_SCOPE_REVIEW_REQUIRED");
    const disclosure={request:el<HTMLInputElement>("disclose-request-"+service.stepId).checked,result:el<HTMLInputElement>("disclose-result-"+service.stepId).checked};
    const epoch=connectionEpoch,key=guideKey(),value=await api(action,{taskId:taskId(),serviceId:id,disclosure});if(epoch!==connectionEpoch||key!==guideKey())return;
    if(action==="evidence"){const url=URL.createObjectURL(new Blob([json(value)],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download="mandate-evidence-bundle.json";link.click();URL.revokeObjectURL(url);return;}
    guideChecks.set(key+"/"+id,{taskId:taskId(),serviceId:id,overall:value.report.overall,requiredChecksPassed:value.report.requiredChecksPassed});guidance.update();const box=document.getElementById("evidence-report-"+service.stepId);if(box)box.innerHTML=`<h3>Independent checks · ${esc(value.report.overall)}</h3><p class="quiet">Financial / record checks passed: ${esc(value.report.requiredChecksPassed)}. Separate process; same OS management. This does not prove missing HTTPS or unobserved history.</p>${value.report.checks.map((c:any)=>`<div class="evidence-item"><div class="row"><b>${esc(c.name)}</b><span class="tag">${esc(c.status)}</span></div><p>${esc(c.source)} · ${esc(c.guarantee)}</p></div>`).join("")}`;return;
  }
  if(action==="receipt"){const r=await api("receipt",{taskId:taskId(),serviceId:id}),url=URL.createObjectURL(new Blob([json(r)],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download="mandate-redacted-receipt.json";link.click();URL.revokeObjectURL(url);return;}
  if(action==="review-request"){const r=await api("owner-request",{requestId:id});await openReview({request:r,input:ownerInputFromDraft(r.draft),task:snapshot.task});return;}
  if(action==="owner-status"){const r=await api("owner-request",{requestId:id});el("error").textContent=`Owner request ${r.status}; permission applied: ${r.actionApplied}`;await refresh();return;}
  if(action==="disconnect"){connectionEpoch++;snapshotGeneration++;ownerConnectionGeneration++;review=undefined;el<HTMLDialogElement>("review").close();token="";snapshot=undefined;ownerConnected=false;guideQuotes.clear();guideChecks.clear();guideServices.clear();guidance.clear();el("content").innerHTML="";el("connection-panel").hidden=false;el("data-mode").textContent="Disconnected";el<HTMLButtonElement>("refresh").disabled=true;el<HTMLButtonElement>("connect-owner").disabled=true;el("connect-owner").textContent="Connect owner wallet";el("network").textContent="No network connected";el("source-block").textContent="No chain snapshot";el("error").textContent="";guidance.update();return;}
  await openReview(await api("owner-action",{input:{action,taskId:taskId(),...(action==="pause"?{paused:!snapshot.context.policy.paused}:{})}}));
}
async function guarded(action:()=>Promise<unknown>,target="error"){el(target).textContent="";try{await action();}catch(error){const feedback=el(target);feedback.textContent=message(error);feedback.scrollIntoView({block:"nearest"});}}
el<HTMLFormElement>("connection-form").addEventListener("submit",event=>{event.preventDefault();void guarded(async()=>{const endpoint=new URL(el<HTMLInputElement>("endpoint").value);if(endpoint.protocol!=="http:"||endpoint.hostname!=="127.0.0.1"||endpoint.pathname!=="/"||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error("Use a trusted http://127.0.0.1:port gateway.");const epoch=++connectionEpoch;ownerConnectionGeneration++;snapshotGeneration++;ownerConnected=false;review=undefined;snapshot=undefined;el("content").innerHTML="";el<HTMLDialogElement>("review").close();updateApprove();el("connect-owner").textContent="Connect owner wallet";apiOrigin=endpoint.origin;token=el<HTMLInputElement>("credential").value;const next=await api("connect");el<HTMLInputElement>("credential").value="";if(epoch!==connectionEpoch)return;snapshot=next;render();});});
el("content").addEventListener("click",event=>{const target=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");if(target){target.disabled=true;void guarded(()=>run(target.dataset.action!,target.dataset.id!)).finally(()=>{target.disabled=false;});}});
el("content").addEventListener("submit",event=>{if((event.target as HTMLElement).id==="search-form"){event.preventDefault();void guarded(async()=>{const result=await api("search",{taskId:taskId(),query:el<HTMLInputElement>("service-query").value});el("directory-results").innerHTML=`<pre>${esc(json(result))}</pre>`;});}});
el("refresh").addEventListener("click",()=>{void guarded(()=>refresh());});
function updateApprove(){el<HTMLButtonElement>("approve").disabled=!ownerConnected||!review||ownerOperations.has(pendingKey(review.request.requestId));guidance.update();}
async function connect(){
  if(fixturePreview())throw new Error("This preset test account has no owner signer in the browser. Use the walkthrough to explore approval and revocation, or connect your own workspace for owner actions.");
  ownerConnected=false;updateApprove();el("connect-owner").textContent="Reconnect owner wallet";
  if(!window.ethereum)throw new Error("Install or open an EIP-1193 wallet browser. No owner key is imported here.");
  const epoch=connectionEpoch,generation=++ownerConnectionGeneration,expected={chainId:snapshot.context.chainId,owner:snapshot.owner};
  await connectOwner(window.ethereum,expected);
  if(epoch!==connectionEpoch||generation!==ownerConnectionGeneration)return;
  ownerConnected=true;el("connect-owner").textContent="Owner connected";updateApprove();
}
el("connect-owner").addEventListener("click",()=>{void guarded(connect);});
el("connect-review-owner").addEventListener("click",()=>{void guarded(connect,"review-error");});
el("close-review").addEventListener("click",()=>el<HTMLDialogElement>("review").close());el("close-task").addEventListener("click",()=>el<HTMLDialogElement>("task-form").close());
el<HTMLFormElement>("policy-form").addEventListener("submit",event=>{event.preventDefault();void guarded(async()=>{const input={budgetAtomic:String(parseUSDC(el<HTMLInputElement>("task-budget").value)),maxPerPaymentAtomic:String(parseUSDC(el<HTMLInputElement>("task-max").value)),ttlSeconds:Number(el<HTMLInputElement>("task-ttl").value)*60},value=await api(formAction==="create"?"create":"owner-action",{input:formAction==="create"?{...input,description:el<HTMLInputElement>("task-description").value}:{...input,action:formAction,taskId:taskId()}});el<HTMLDialogElement>("task-form").close();await openReview(value);},"task-error");});
function ownerFeedback(value:any,epoch:number,text:string){
  if(epoch!==connectionEpoch)return;
  const target=review===value&&el<HTMLDialogElement>("review").open?"review-error":"error",feedback=el(target);
  feedback.textContent=target==="review-error"?text:`Owner request ${value.request.requestId}: ${text}`;feedback.scrollIntoView({block:"nearest"});
}
async function ownerOperation(mode:"submit"|"recover"){
  // Capture the original review and connection before the wallet / network yields.
  const value=review,epoch=connectionEpoch,session=connection(),selectedAtStart=snapshot?.task.id,viewGeneration=snapshotGeneration;if(!value||!snapshot)return;
  const key=pendingKey(value.request.requestId),task=value.task.id;
  if(ownerOperations.has(key)){ownerFeedback(value,epoch,message(new Error("OWNER_REQUEST_IN_PROGRESS")));return;}
  ownerOperations.add(key);updateApprove();el("review-error").textContent="";
  try{
    const previous=localStorage.getItem(key),record:OwnerSubmission|undefined=previous?JSON.parse(previous):undefined;
    if(mode==="submit"){
      if(!window.ethereum||!ownerConnected)throw new Error("Connect the owner wallet first.");
      const submission=await submitOwnerDraft(window.ethereum,value.request,value.input,r=>localStorage.setItem(key,json(r)),record);
      await api("owner-broadcast",{requestId:submission.requestId,transactionHash:submission.transactionHash},session);
      const followCreated=value.request.draft.action==="create"&&review===value&&snapshot?.task.id===selectedAtStart&&snapshotGeneration===viewGeneration;
      if(epoch===connectionEpoch&&(snapshot?.task.id===task||followCreated))await refresh(task);
      if(epoch===connectionEpoch&&review===value)el<HTMLDialogElement>("review").close();
    }else{
      if(record?.transactionHash)await api("owner-broadcast",{requestId:record.requestId,transactionHash:record.transactionHash},session);
      const r=await api("owner-request",{requestId:value.request.requestId},session);
      ownerFeedback(value,epoch,`${r.status} · applied ${r.actionApplied}. ${record?.state==="submission-unknown"&&!record.transactionHash?"Check your wallet activity for a broadcast hash before trying again.":""}`);
      if(epoch===connectionEpoch&&snapshot?.task.id===task)await refresh(task);
    }
  }catch(error){ownerFeedback(value,epoch,message(error));}
  finally{ownerOperations.delete(key);if(epoch===connectionEpoch)updateApprove();}
}
el("approve").addEventListener("click",()=>{void ownerOperation("submit");});
el("recover-owner").addEventListener("click",()=>{void ownerOperation("recover");});
window.addEventListener("hashchange",render);for(const name of ["accountsChanged","chainChanged","disconnect"])window.ethereum?.on?.(name,()=>{ownerConnectionGeneration++;ownerConnected=false;el<HTMLButtonElement>("approve").disabled=true;el("connect-owner").textContent="Reconnect owner wallet";guidance.update();});
if(location.protocol==="http:"&&location.hostname==="127.0.0.1")el<HTMLInputElement>("endpoint").value=location.origin;
el<HTMLButtonElement>("local-demo").hidden=!localDemo;
el("local-demo").addEventListener("click",()=>{if(!localDemo)return;el<HTMLInputElement>("endpoint").value=location.origin;el<HTMLInputElement>("credential").value=fixtureCredential;el<HTMLFormElement>("connection-form").requestSubmit();});
if(new URLSearchParams(location.search).get("onboarding")==="1"||location.hash==="#onboarding"){
  if(location.hash==="#onboarding")history.replaceState(null,"",location.pathname+location.search+"#overview");
  void guarded(async()=>{apiOrigin=location.origin;token="";connectionEpoch++;const next=await api("connect");snapshot=next;render();});
}
for(const id of ["review","task-form"])el<HTMLDialogElement>(id).addEventListener("close",()=>guidance.update());
}
