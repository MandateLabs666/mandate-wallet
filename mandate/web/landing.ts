// Illustrative homepage only. No workspace API, wallet provider or payment calls.
export function bootLanding(){
  const root=document.body,hero=document.querySelector<HTMLElement>(".landing-hero"),canvas=document.querySelector<HTMLCanvasElement>("#permission-field"),motion=matchMedia("(prefers-reduced-motion: reduce)");
  const toggle=document.querySelector<HTMLButtonElement>("#motion-toggle"),ctx=canvas?.getContext("2d");
  const clamp=(v:number,min=-1,max=1)=>Math.max(min,Math.min(max,v));
  const target={x:0,y:0,px:.5,py:.5,active:false},look={x:0,y:0,vx:0,vy:0,px:.5,py:.5,energy:0};
  const trail:{x:number;y:number;time:number}[]=[],pulses:{x:number;y:number;time:number}[]=[];
  let playing=!motion.matches,frame=0,visible=true,clock=0,last=0,lastPulse=-1;
  function project(){
    if(!hero)return;
    for(const [name,value] of Object.entries({"--field-x":look.x.toFixed(4),"--field-y":look.y.toFixed(4),"--field-energy":look.energy.toFixed(4),"--card-x":`${(look.x*18).toFixed(2)}px`,"--card-y":`${(look.y*12).toFixed(2)}px`,"--card-rx":`${(-look.y*15).toFixed(2)}deg`,"--card-ry":`${(look.x*22).toFixed(2)}deg`,"--pointer-x":`${(look.px*100).toFixed(2)}%`,"--pointer-y":`${(look.py*100).toFixed(2)}%`}))hero.style.setProperty(name,value);
    hero.dataset.fieldState=!playing||motion.matches?"paused":target.active?"following":"idle";
  }
  function reset(){target.active=false;target.x=0;target.y=0;}
  function canInteract(event:PointerEvent){return playing&&!motion.matches&&visible&&!document.hidden&&event.pointerType!=="touch"&&!(event.target as Element).closest("a,button,input,select");}
  hero?.addEventListener("pointermove",event=>{
    if(!canInteract(event)){reset();return;}
    const bounds=hero.getBoundingClientRect(),art=canvas?.getBoundingClientRect();if(!art?.width||!art.height)return;
    target.x=clamp((event.clientX-bounds.left)/bounds.width*2-1);target.y=clamp((event.clientY-bounds.top)/Math.min(bounds.height,850)*2-1);
    target.px=clamp((event.clientX-art.left)/art.width,-.2,1.2);target.py=clamp((event.clientY-art.top)/art.height,-.2,1.2);target.active=true;
  },{passive:true});
  hero?.addEventListener("pointerleave",reset);
  hero?.addEventListener("pointerdown",event=>{
    if(!canInteract(event)||clock-lastPulse<.28)return;
    const bounds=canvas?.getBoundingClientRect();if(!bounds?.width||!bounds.height)return;
    pulses.push({x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height,time:clock});if(pulses.length>3)pulses.shift();lastPulse=clock;
  },{passive:true});
  window.addEventListener("blur",reset);
  function advance(dt:number){
    // A damped spring gives the boundary weight rather than attaching it to the cursor.
    const decay=Math.exp(-11*dt),ease=1-Math.exp(-8*dt);
    look.vx=(look.vx+(target.x-look.x)*85*dt)*decay;look.vy=(look.vy+(target.y-look.y)*85*dt)*decay;
    look.x=clamp(look.x+look.vx*dt,-1.15,1.15);look.y=clamp(look.y+look.vy*dt,-1.15,1.15);
    look.px+=(target.px-look.px)*ease;look.py+=(target.py-look.py)*ease;look.energy+=((target.active?1:0)-look.energy)*ease;
    if(target.active){const previous=trail.at(-1);if(!previous||Math.hypot(look.px-previous.x,look.py-previous.y)>.007)trail.push({x:look.px,y:look.py,time:clock});}
    while(trail.length&&(clock-trail[0].time>1||trail.length>22))trail.shift();
    while(pulses.length&&clock-pulses[0].time>1.6)pulses.shift();project();
  }
  function draw(time:number){
    if(!canvas||!ctx)return;
    const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.75),w=box.width,h=box.height;if(!w||!h)return;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const scale=Math.min(w/540,h/550,1.25),centerY=h*(w<600?.32:.48),mouseX=look.px*w,mouseY=look.py*h,points:{x:number;y:number;z:number;r:number;a:number;hot:number}[]=[],count=w<450?100:160;
    for(let layer=0;layer<3;layer++)for(let band=0;band<3;band++)for(let i=0;i<count;i++){
      const u=i/count*Math.PI*2+time*(layer===1?-.13:.1),radius=180+band*3,ax=.58+layer*.93+look.y*.35,ay=-.42+Math.sin(time*.16)*.14+look.x*.5;
      let x=Math.cos(u)*radius,y=Math.sin(u)*radius,z=Math.sin(u*4+band)*2;
      const yy=y*Math.cos(ax)-z*Math.sin(ax);z=y*Math.sin(ax)+z*Math.cos(ax);y=yy;
      const xx=x*Math.cos(ay)+z*Math.sin(ay);z=-x*Math.sin(ay)+z*Math.cos(ay);x=xx;
      const rz=-.4+time*.055+look.x*.14,xr=x*Math.cos(rz)-y*Math.sin(rz);y=x*Math.sin(rz)+y*Math.cos(rz);x=xr;
      const perspective=660/(660+z),sx=w/2+x*perspective*scale+look.x*14,sy=centerY+y*perspective*scale+look.y*10;
      const dx=sx-mouseX,dy=sy-mouseY,distance=Math.hypot(dx,dy),hot=Math.max(0,1-distance/(125*scale))*look.energy,bend=hot*hot*24*scale;
      points.push({x:sx+dx/(distance||1)*bend,y:sy+dy/(distance||1)*bend,z,r:((band===1?1.35:.65)*perspective+hot*1.2)*scale,a:Math.max(.12,.7-z/420),hot});
    }
    points.sort((a,b)=>b.z-a.z);
    for(const p of points){ctx.beginPath();ctx.fillStyle=p.hot>.12?`rgba(120,187,255,${Math.min(1,p.a+p.hot*.4)})`:`rgba(201,215,236,${p.a})`;ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
    ctx.save();ctx.globalCompositeOperation="screen";
    // A local constellation and a decaying trail respond without replacing the cursor.
    const near=points.filter((p,i)=>p.hot>.35&&i%13===0).slice(0,7);
    if(near.length>1){ctx.beginPath();near.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=`rgba(112,180,255,${look.energy*.26})`;ctx.lineWidth=.8;ctx.stroke();}
    for(let i=1;i<trail.length;i++){const a=trail[i-1],b=trail[i],alpha=Math.max(0,1-(time-b.time))*look.energy;ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.strokeStyle=`rgba(131,197,255,${alpha*.52})`;ctx.lineWidth=1.25*scale;ctx.stroke();}
    for(const pulse of pulses){const age=time-pulse.time,alpha=(1-age/1.6)**2,radius=(18+age*160)*scale;ctx.beginPath();ctx.ellipse(pulse.x*w,pulse.y*h,radius,radius*.65,-.3,0,Math.PI*2);ctx.strokeStyle=`rgba(143,202,255,${alpha*.46})`;ctx.lineWidth=1.2;ctx.stroke();}
    if(look.energy>.02){const glow=ctx.createRadialGradient(mouseX,mouseY,0,mouseX,mouseY,95*scale);glow.addColorStop(0,`rgba(90,165,255,${look.energy*.12})`);glow.addColorStop(1,"#5aa5ff00");ctx.fillStyle=glow;ctx.fillRect(mouseX-100*scale,mouseY-100*scale,200*scale,200*scale);}
    // Request markers orbit the boundary; the central object is an authorization seal.
    for(let i=0;i<3;i++){
      const a=time*.28+i*Math.PI*2/3,x=w/2+Math.cos(a)*205*scale+look.x*18,y=centerY+Math.sin(a)*80*scale+look.y*12;
      const glow=ctx.createRadialGradient(x,y,0,x,y,15*scale);glow.addColorStop(0,"#edf5ff");glow.addColorStop(.15,"#75baff");glow.addColorStop(1,"#75baff00");ctx.fillStyle=glow;ctx.fillRect(x-16*scale,y-16*scale,32*scale,32*scale);
    }
    ctx.restore();
  }
  function tick(now:number){const dt=last?Math.min((now-last)/1000,1/30):1/60;last=now;clock+=dt;advance(dt);draw(clock);frame=playing&&visible&&!document.hidden?requestAnimationFrame(tick):0;}
  function sync(){
    root.classList.toggle("motion-paused",!playing);toggle?.setAttribute("aria-pressed",String(!playing));if(toggle)toggle.textContent=playing?"Pause motion":"Play motion";
    if(frame)cancelAnimationFrame(frame);frame=0;last=0;
    if(!playing||motion.matches){reset();Object.assign(look,{x:0,y:0,vx:0,vy:0,energy:0});trail.length=0;pulses.length=0;}
    if(document.hidden)reset();project();
    if(playing&&visible&&!document.hidden)frame=requestAnimationFrame(tick);else draw(clock);
  }
  toggle?.addEventListener("click",()=>{playing=!playing;sync();});
  motion.addEventListener("change",()=>{playing=!motion.matches;sync();});document.addEventListener("visibilitychange",sync);
  if(canvas)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)reset();sync();}).observe(canvas);
  new ResizeObserver(()=>draw(clock)).observe(canvas??root);sync();

  const scenes={
    purchase:{label:"An approved purchase",stages:[
      ["Start with a clear mandate.","The owner approves a 0.15 USDC task budget, a 0.10 per-payment cap and a specific service scope.","0.15","Ready","Not requested","Unchecked"],
      ["A request meets its boundary.","The agent selects an approved data service. The latest offer is 0.01 USDC, within the signed scope.","0.15","Scope checked","Not requested","Unchecked"],
      ["Reserve first. Then pay.","A registered payment commitment occupies the budget before the payment signature is released.","0.14","Paid · 0.01","Awaiting response","Unchecked"],
      ["Delivery gets its own status.","The service returns a response. Confirmed payment alone does not make the task complete.","0.14","Paid · 0.01","Returned","Unchecked"],
      ["Check the outcome.","A defined result checker validates the response. Authorization, payment and delivery stay linked in the evidence.","0.14","Paid · 0.01","Returned","Valid"]]},
    recovery:{label:"A service fails after payment",stages:[
      ["An approved request starts.","The same 0.15 USDC mandate authorizes one 0.01 USDC data request.","0.15","Ready","Not requested","Unchecked"],
      ["The order gets an identity.","The task step, nonce and payment parameters are bound to one persistent commitment.","0.14","Registered","Not requested","Unchecked"],
      ["Paid. But not delivered.","The payment succeeds, then the API returns an error. The three outcomes remain separate.","0.14","Paid · 0.01","Failed · HTTP 500","Unchecked"],
      ["Recover the original order.","The retry reconciles the existing payment and reuses the original order. It does not initiate a second payment.","0.14","Same payment","Retry original order","Unchecked"],
      ["One payment. A checked result.","The service returns successfully on recovery. Total paid is still 0.01 USDC.","0.14","Paid once · 0.01","Returned","Valid"]]},
    revocation:{label:"Permission is revoked",stages:[
      ["The owner takes back permission.","Revocation becomes effective onchain. A local request to revoke is not treated as confirmed authority.","0.15","Not started","Not requested","Unchecked"],
      ["The agent makes another request.","A request still has to satisfy the current policy and session state, even if an earlier check passed.","0.15","Recheck required","Not requested","Unchecked"],
      ["The boundary holds.","The revoked authorization is rejected. A previously issued session cannot create a new eligible payment.","0.15","Rejected","Not requested","Unchecked"],
      ["No new payment goes out.","The rejected request does not purchase a service. Existing paid history and unresolved commitments are retained.","0.15","No new payment","Not requested","Unchecked"],
      ["History stays inspectable.","The owner can inspect earlier evidence. Revocation removes future permission; it does not erase what happened.","0.15","No new payment","Not requested","Unchecked"]]}
  } as const;
  type Scene=keyof typeof scenes;let scene:Scene="purchase",step=0,demoVisible=false;
  const demo=document.querySelector<HTMLElement>("#journey-demo");
  function render(){
    if(!demo)return;const value=scenes[scene].stages[step];demo.dataset.scene=scene;demo.dataset.phase=String(step);
    for(const [id,text]of [["demo-title",value[0]],["demo-copy",value[1]],["demo-budget",value[2]],["demo-payment",value[3]],["demo-service",value[4]],["demo-result",value[5]],["demo-counter",`0${step+1} / 05`]]){const el=document.getElementById(id);if(el)el.textContent=text;}
    document.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach(b=>{const active=b.dataset.scenario===scene;b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1;});
    document.querySelectorAll<HTMLButtonElement>("[data-phase]").forEach(b=>{const active=Number(b.dataset.phase)===step;b.classList.toggle("is-current",active);b.classList.toggle("is-past",Number(b.dataset.phase)<step);if(active)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");});
  }
  document.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach(b=>{
    b.addEventListener("click",()=>{scene=b.dataset.scenario as Scene;step=0;render();});
    b.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const keys=Object.keys(scenes) as Scene[],i=keys.indexOf(scene);scene=keys[event.key==="Home"?0:event.key==="End"?2:(i+(event.key==="ArrowRight"?1:2))%3];step=0;render();document.querySelector<HTMLButtonElement>(`[data-scenario="${scene}"]`)?.focus();});
  });
  document.querySelectorAll<HTMLButtonElement>("[data-phase]").forEach(b=>b.addEventListener("click",()=>{step=Number(b.dataset.phase);render();}));
  document.querySelector("#demo-replay")?.addEventListener("click",()=>{step=0;render();});
  if(demo)new IntersectionObserver(entries=>{demoVisible=entries[0].isIntersecting;},{threshold:.25}).observe(demo);
  setInterval(()=>{if(playing&&demoVisible&&!document.hidden){step=(step+1)%5;render();}},4800);render();
  const menu=document.querySelector<HTMLButtonElement>("#menu-toggle"),nav=document.querySelector<HTMLElement>("#site-nav");
  menu?.addEventListener("click",()=>{const expanded=menu.getAttribute("aria-expanded")!=="true";menu.setAttribute("aria-expanded",String(expanded));nav?.classList.toggle("is-open",expanded);});
  nav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{menu?.setAttribute("aria-expanded","false");nav.classList.remove("is-open");}));
  const reveal=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){e.target.classList.add("revealed");reveal.unobserve(e.target);}},{threshold:.12});document.querySelectorAll("[data-reveal]").forEach(el=>reveal.observe(el));
}
