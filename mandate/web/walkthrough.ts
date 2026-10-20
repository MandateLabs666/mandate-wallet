// A deliberately isolated teaching example: no Gateway, provider or payment calls.
const scenes=[
  {label:"The task",title:"The agent needs paid data",detail:"You ask an agent for an Ethereum market brief. It finds a data API that costs 0.10 USDC. Mandate lets you approve that limited purchase without giving the agent your owner key.",takeaway:"The job belongs to the agent. The spending boundary belongs to you.",message:"Task: fetch approved ETH data and prepare a brief",next:"Define the example boundary",actor:"agent",permission:"Not approved",payment:"Not started",delivery:"Not requested",result:"Unchecked",occupied:0,charged:0},
  {label:"Your boundary",title:"Approve a task, not unlimited spending",detail:"In this example, you review a 0.15 USDC task budget, a 0.10 per-payment limit, one approved merchant and data step, and a 15-minute expiry. In the real workspace, only the owner wallet can approve the policy and its finite session.",takeaway:"A new recipient, a higher limit or a longer permission needs new owner approval. This illustration does not create any authority.",message:"Owner review → limited policy + finite session",next:"Illustrate owner approval",actor:"owner",permission:"Awaiting approval",payment:"Not started",delivery:"Not requested",result:"Unchecked",occupied:0,charged:0},
  {label:"The quote",title:"The service asks for 0.10 USDC",detail:"The example owner has approved the boundary. The agent receives an x402 payment request. The client checks the network, token, recipient, request and amount against that approval before registering anything.",takeaway:"A quote is a price request. It does not authorize a new merchant or increase the budget.",message:"402 Payment Required · approved service · 0.10 USDC",next:"Illustrate budget reservation",actor:"wallet",permission:"Active",payment:"Quoted",delivery:"Not requested",result:"Unchecked",occupied:0,charged:0},
  {label:"Reserve",title:"Reserve before signing a payment",detail:"The example commitment reserves 0.10 USDC before a payment signature is issued. Available authorization falls to 0.05. Until the original payment outcome is known, that reservation stays occupied.",takeaway:"A timeout does not make the budget available again. Another 0.10 request exceeds the remaining 0.05 authorization.",message:"Reserved · original order demo-order-001",next:"Illustrate payment and a service failure",actor:"wallet",permission:"Active",payment:"Reserved · unresolved",delivery:"Not requested",result:"Unchecked",occupied:10,charged:0},
  {label:"Pay",title:"Paid does not mean delivered",detail:"The example payment settles for 0.10 USDC, but the service response fails. Payment is recorded as paid; delivery is still missing. The occupied amount remains 0.10, including that paid history.",takeaway:"Keep the original order. A service failure is not permission to pay for the same step again.",message:"Payment settled · service response unavailable",next:"Illustrate recovery of the same order",actor:"merchant",permission:"Active",payment:"Paid",delivery:"Response failed",result:"Unchecked",occupied:10,charged:10},
  {label:"Recover & inspect",title:"Recover delivery without paying twice",detail:"The agent reuses demo-order-001 and its original payment. The example service returns the data, then a separate result check passes. The total charge stays 0.10 USDC. In the real product, inspect the evidence and its source limits for each outcome.",takeaway:"A valid result check has a defined scope. It does not prove every source or complete history.",message:"Same order · no second payment · result checked",next:"Illustrate revoking future permission",actor:"agent",permission:"Active",payment:"Paid",delivery:"Returned",result:"Check passed",occupied:10,charged:10},
  {label:"Revoke",title:"Stop future spending, keep the history",detail:"The example owner revokes the session. New eligible payments through that session are blocked. The earlier payment, delivered data and result record remain visible. Revocation does not refund the original payment or erase its occupied history.",takeaway:"You have seen the full loop: task → limited approval → quote → reserve → pay → recover → inspect → revoke.",message:"Session revoked · future payment rejected",next:"Explore the workspace",actor:"owner",permission:"Session revoked",payment:"Paid",delivery:"Returned",result:"Check passed",occupied:10,charged:10},
];
export function bootWalkthrough(){
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  let step=0,playing=false,timer:ReturnType<typeof setTimeout>|undefined;
  const nav=el("flow-steps");
  function alignNavigation(){const current=nav.querySelector<HTMLElement>('[aria-current="step"]');if(current&&nav.scrollWidth>nav.clientWidth){const n=nav.getBoundingClientRect(),b=current.getBoundingClientRect();nav.scrollTo({left:nav.scrollLeft+b.left-n.left-(nav.clientWidth-b.width)/2,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}}
  scenes.forEach((scene,index)=>{const button=document.createElement("button");button.type="button";button.dataset.step=String(index);const number=document.createElement("span"),label=document.createElement("b");number.textContent=String(index+1).padStart(2,"0");number.setAttribute("translate","no");label.textContent=scene.label;button.append(number,label);button.addEventListener("click",()=>{pause();step=index;render();});nav.append(button);});
  const put=(id:string,value:string)=>{el(id).textContent=value;};
  function pause(){playing=false;clearTimeout(timer);el("flow-play").setAttribute("aria-pressed","false");put("flow-play","Play the whole flow");document.body.classList.remove("is-playing");}
  function schedule(){clearTimeout(timer);if(playing)timer=setTimeout(()=>{if(step<scenes.length-1){step++;render();}else pause();},6500);}
  function render(){
    const s=scenes[step],final=step===scenes.length-1;
    const nextFocused=document.activeElement===el("flow-next");
    el("flow-player").dataset.step=String(step);el("flow-visual").dataset.actor=s.actor;
    for(const button of nav.querySelectorAll<HTMLButtonElement>("button")){button.setAttribute("aria-current",Number(button.dataset.step)===step?"step":"false");button.classList.toggle("is-complete",Number(button.dataset.step)<step);}
    alignNavigation();
    put("flow-step-count",`${String(step+1).padStart(2,"0")} / ${String(scenes.length).padStart(2,"0")}`);
    for(const [id,value] of Object.entries({"flow-title":s.title,"flow-detail":s.detail,"flow-takeaway":s.takeaway,"flow-message":s.message,"flow-permission":s.permission,"flow-payment":s.payment,"flow-delivery":s.delivery,"flow-result":s.result,"flow-next":s.next}))put(id,value);
    put("flow-available",((15-s.occupied)/100).toFixed(2));put("flow-occupied",(s.occupied/100).toFixed(2));put("flow-charged",(s.charged/100).toFixed(2)+" USDC");
    el("flow-budget-bar").style.width=`${(15-s.occupied)/15*100}%`;
    el<HTMLButtonElement>("flow-previous").disabled=step===0;el("flow-next").hidden=final;el("flow-finish").hidden=!final;
    if(final&&nextFocused)el("flow-finish").focus({preventScroll:true});
    put("flow-live",s.title);if(final)pause();else schedule();
  }
  el("flow-previous").addEventListener("click",()=>{pause();step=Math.max(0,step-1);render();});
  el("flow-next").addEventListener("click",()=>{pause();step=Math.min(scenes.length-1,step+1);render();});
  el("flow-restart").addEventListener("click",()=>{pause();step=0;render();});
  el("flow-play").addEventListener("click",()=>{if(playing){pause();return;}if(step===scenes.length-1)step=0;playing=true;document.body.classList.add("is-playing");el("flow-play").setAttribute("aria-pressed","true");put("flow-play","Pause the walkthrough");render();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();});
  window.addEventListener("pagehide",pause);window.addEventListener("resize",alignNavigation);render();
}
