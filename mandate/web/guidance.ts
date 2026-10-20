import {resolveWorkspaceGuide,type GuideContext,type GuideTarget} from "./guidance-model.js";
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export class WorkspaceGuide{
  private open=true;
  private locating=0;
  private highlighted?:HTMLElement;
  private highlightTimer?:ReturnType<typeof setTimeout>;
  private rendered="";
  constructor(private context:()=>GuideContext,private navigate:(page:string)=>void,private selectService:(id:string)=>void=()=>{}){
    // Scroll must never change this panel's in-flow height. Details are explicit.
    document.getElementById("workspace-guide")?.classList.add("guide-compact");
    document.getElementById("guide-toggle")?.addEventListener("click",()=>{this.open=!this.open;this.clear();this.update();});
    document.getElementById("workspace-guide")?.addEventListener("click",event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-guide-locate],[data-guide-close],[data-guide-details],[data-guide-service]");if(b?.hasAttribute("data-guide-service")){const id=b.dataset.guideService;if(id&&this.context().snapshot?.services.some(s=>s.serviceId===id)){this.clear();this.selectService(id);}}else if(b?.hasAttribute("data-guide-details")){document.getElementById("workspace-guide")?.classList.toggle("guide-detail-open");this.update();document.querySelector<HTMLElement>("[data-guide-details]")?.focus();}else if(b?.hasAttribute("data-guide-close")){this.open=false;this.clear();this.update();document.getElementById("guide-toggle")?.focus();}else if(b)void this.locate();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")this.clear();});
    document.addEventListener("pointerdown",e=>{if(this.highlighted?.contains(e.target as Node))this.clear();},{passive:true});
    this.update();
  }
  private identity(){const c=this.context(),s=c.snapshot;return s?`${c.connectionEpoch}/${s.context.chainId}/${s.context.wallet}/${s.task.id}/${s.context.policy.version}/${s.context.grant.policyVersion}/${c.activeService}`:`disconnected/${c.connectionEpoch}`;}
  clear(){this.locating++;clearTimeout(this.highlightTimer);this.highlighted?.classList.remove("guide-spotlight");this.highlighted=undefined;}
  update(){
    const root=document.getElementById("workspace-guide"),toggle=document.getElementById("guide-toggle");if(!root)return;
    const c=this.context(),model=resolveWorkspaceGuide(c),services=c.snapshot?.services??[],selected=services.find(s=>s.serviceId===c.activeService)??services[0],serviceLabel=(s:typeof services[number],i:number)=>s.url?.includes("ETH")?"ETH data":s.url?.includes("BTC")?"BTC data":`Step ${i+1}`;toggle?.setAttribute("aria-expanded",String(this.open));root.hidden=!this.open;if(!this.open)return;
    const rendered=JSON.stringify({model,services,selected:selected?.serviceId,details:root.classList.contains("guide-detail-open")});
    if(this.rendered===rendered)return;this.rendered=rendered;
    if(root.dataset.guideState&&root.dataset.guideState!==model.id)this.clear();
    root.dataset.guideState=model.id;
    root.innerHTML=`<div class="guide-path" aria-label="Step progress">${model.steps.map((s,i)=>`<span class="${s.done?"is-done":i===model.stage?"is-current":""}"><i aria-hidden="true">${s.done?"✓":i+1}</i>${esc(s.label)}</span>`).join("")}</div><div class="guide-current"><div class="guide-emblem" aria-hidden="true">↗</div><div class="guide-description"><p class="guide-kicker">YOUR NEXT STEP <span>${esc(model.state==="attention"?"Needs attention":model.state==="waiting"?"In progress":"Ready")}${selected?` · ${esc(serviceLabel(selected,services.indexOf(selected)))}`:""}</span></p><h2>${esc(model.title)}</h2><p>${esc(model.detail)}</p>${model.blockers.length?`<small class="guide-blocker">${model.blockers.map(esc).join(" · ")}</small>`:""}</div><button class="button" type="button" data-guide-locate>${esc(model.label)} <span aria-hidden="true">↗</span></button><button class="guide-details" data-guide-details aria-expanded="${root.classList.contains("guide-detail-open")}">${root.classList.contains("guide-detail-open")?"Hide details":"Why this step?"}</button><button class="guide-close" data-guide-close aria-label="Collapse task guide">×</button></div>${services.length>1?`<div class="guide-services" aria-label="Select the step to guide"><span>Guide this step</span>${services.map((s,i)=>`<button type="button" data-guide-service="${esc(s.serviceId)}" aria-pressed="${s.serviceId===selected?.serviceId}">${esc(serviceLabel(s,i))}</button>`).join("")}</div>`:""}<p class="guide-scope">Guidance for <b${c.snapshot?' translate="no"':""}>${esc(model.task)}</b> · Locates controls. You choose and confirm every action. <a href="docs.html#case"><span data-zh="将 Mandate 接入 Agent：完整案例教程">Agent setup and complete case</span></a></p>`;
  }
  private target(t:GuideTarget):HTMLElement|undefined{
    if(t.element)return document.getElementById(t.element)??undefined;
    if(t.action)return Array.from(document.querySelectorAll<HTMLElement>("#content [data-action]")).find(e=>e.dataset.action===t.action&&(!t.id||e.dataset.id===t.id));
    return document.querySelector<HTMLElement>("#content .panel, #content .table-wrap")??undefined;
  }
  async locate(){
    this.clear();const guide=document.getElementById("workspace-guide");
    if(guide?.classList.contains("guide-detail-open")){guide.classList.remove("guide-detail-open");this.update();}
    const generation=this.locating,identity=this.identity(),model=resolveWorkspaceGuide(this.context());
    if(model.target.page)this.navigate(model.target.page);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    if(this.locating!==generation||this.identity()!==identity)return;
    const target=this.target(model.target);if(!target){const notice=document.getElementById("guide-announcement");if(notice)notice.textContent="This action is unavailable in the current view. Refresh the workspace and inspect its current state.";return;}
    // Keep native dialogs in control of their own focus; never click an action.
    const modal=document.querySelector<HTMLDialogElement>("dialog[open]");if(modal&&!modal.contains(target)&&modal!==target)return;
    target.classList.add("guide-spotlight");this.highlighted=target;
    const notice=document.getElementById("guide-announcement");if(notice)notice.textContent="The next control is highlighted. Select it to continue; locating never approves or submits an action.";
    // Place the control immediately; its finite highlight provides the motion.
    const behavior="instant" as const;
    if(modal)target.scrollIntoView({block:"nearest",behavior});
    else{
      const guide=document.getElementById("workspace-guide"),height=guide&&!guide.hidden?guide.getBoundingClientRect().height:0;
      const covered=height+(guide?Number.parseFloat(getComputedStyle(guide).top)||0:0)+20,rect=target.getBoundingClientRect();
      const top=covered+Math.max(0,(innerHeight-covered-24-rect.height)/2);
      window.scrollTo({top:Math.max(0,scrollY+rect.top-top),behavior});
    }
    if(!target.matches("button,a,input,select,dialog"))target.tabIndex=-1;target.focus({preventScroll:true});
    this.highlightTimer=setTimeout(()=>{if(this.highlighted===target)this.clear();},6500);
  }
}
