import {zhCN} from "./i18n-catalog.js";
export type Locale="en"|"zh-CN";
const key="mandate.ui.locale.v1";

// Display strings only. Never call this on transaction data, requests or user input.
export function translateDisplay(source:string,locale:Locale):string{
  if(locale==="en")return source;
  const text=source.trim();let translated=zhCN[text];
  if(translated===undefined){
    const patterns:[RegExp,(...values:string[])=>string][]=[
      [/^Step (\d+)$/,n=>`步骤 ${n}`],
      [/^([\d.]+ USDC) · (eip155:\d+) · recipient (0x[0-9a-fA-F]+) · (.+)$/,(amount,network,recipient,proof)=>`${amount} · ${network} · 收款人 ${recipient} · ${proof}`],
      [/^(Needs attention|In progress|Ready) · (ETH data|BTC data|Step \d+)$/,(state,service)=>`${zhCN[state]} · ${translateDisplay(service,"zh-CN")}`],
      [/^(ETH|BTC|Approved) statistics$/,asset=>`${asset==="Approved"?"批准服务":asset} 统计数据`],
      [/^Block (\d+) · (.+) · 6-decimal USDC$/,(block,time)=>`区块 ${block} · ${time} · USDC（6 位小数）`],
      [/^Approved recipient (0x[0-9a-fA-F]+) · merchant (0x[0-9a-fA-F]+)$/,(recipient,merchant)=>`已批准收款人 ${recipient} · 商户 ${merchant}`],
      [/^Independent checks · (incomplete|passed|failed|valid)$/,(state)=>`独立检查 · ${zhCN[state]??state}`],
      [/^(paid|pending|registering|reserved|rejected) · ([\d.]+ USDC)$/,(state,amount)=>`${zhCN[state]??state} · ${amount}`],
      [/^([\d.]+) USDC · owner approval required$/,amount=>`${amount} USDC · 需账户所有者批准`],
      [/^Owner request (0x[0-9a-fA-F]{64}): (.+)$/,(id,detail)=>`授权操作 ${id}：${translateDisplay(detail,"zh-CN")}`],
      [/^Owner request ([a-z_-]+); permission applied: (true|false)$/,(state,applied)=>`授权操作：${zhCN[state]??state}；权限已生效：${applied==="true"?"是":"否"}`],
      [/^([a-z_-]+) · applied (true|false)\. ?(.*)$/,(state,applied,detail)=>`${zhCN[state]??state} · 已生效：${applied==="true"?"是":"否"}。${translateDisplay(detail,"zh-CN")}`],
      [/^Occupied = paid history \+ unresolved commitments \+ other conservative occupancy\. Known unresolved: ([\d.]+); other occupied: ([\d.]+) USDC\. Available budget is not a token balance\.$/,(pending,other)=>`已用及预留额度包括已付款金额、结果待确认的付款，以及其他需要保留的额度。其中已知待确认金额为 ${pending} USDC，其他保留额度为 ${other} USDC。剩余预算与钱包余额分开计算。`],
      [/^Applied: (true|false) · active task grant: (true|false)$/,(applied,active)=>`已生效：${applied==="true"?"是":"否"} · 当前任务授权有效：${active==="true"?"是":"否"}`],
      [/^Financial \/ record checks passed: (true|false)\. Separate process; same OS management\. This does not prove missing HTTPS or unobserved history\.$/,passed=>`资金与记录检查通过：${passed==="true"?"是":"否"}。验证在独立进程中运行，但仍由同一系统管理员控制，不构成 HTTPS 来源或未观测历史的证明。`],
    ];
    for(const [pattern,render] of patterns){const match=text.match(pattern);if(match){translated=render(...match.slice(1));break;}}
  }
  return translated===undefined?source:source.replace(text,translated);
}

export function bootI18n(){
  let locale:Locale="en";
  try{const saved=localStorage.getItem(key);if(saved==="zh-CN"||saved==="en")locale=saved;}catch{/* Storage can be disabled; the current page still works. */}
  const texts=new WeakMap<Text,{source:string;last:string}>(),attrs=new WeakMap<Element,Map<string,{source:string;last:string}>>(),explicit=new WeakMap<Element,string>();
  const excluded="script,style,svg,pre,code,textarea,[translate=no],[data-no-translate],[data-language-toggle],[data-zh]";
  const title=document.title;
  let queued=false;
  const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;apply();});}});
  function apply(){
    observer.disconnect();document.documentElement.lang=locale;
    for(const node of document.querySelectorAll<HTMLElement>("[data-zh]")){
      if(!explicit.has(node))explicit.set(node,node.textContent??"");
      const value=locale==="zh-CN"?node.dataset.zh!:explicit.get(node)!;if(node.textContent!==value)node.textContent=value;
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let next:Node|null;
    while((next=walker.nextNode())){
      const node=next as Text;if(node.parentElement?.closest(excluded))continue;
      let state=texts.get(node);if(!state||node.data!==state.last)state={source:node.data,last:node.data};
      const value=translateDisplay(state.source,locale);if(node.data!==value)node.data=value;state.last=value;texts.set(node,state);
    }
    for(const node of document.querySelectorAll<HTMLElement>("[aria-label],[title],[placeholder]")){
      if(node.closest("svg,[translate=no],[data-no-translate],[data-language-toggle]"))continue;
      let states=attrs.get(node);if(!states){states=new Map();attrs.set(node,states);}
      for(const name of ["aria-label","title","placeholder"]){
        const current=node.getAttribute(name);if(current===null)continue;
        let state=states.get(name);if(!state||current!==state.last)state={source:current,last:current};
        const value=translateDisplay(state.source,locale);if(current!==value)node.setAttribute(name,value);state.last=value;states.set(name,state);
      }
    }
    document.title=translateDisplay(title,locale);
    for(const button of document.querySelectorAll<HTMLButtonElement>("[data-language-toggle]")){
      button.textContent=locale==="en"?"中文":"EN";
      button.setAttribute("aria-label",locale==="en"?"切换到中文":"Switch to English");button.lang=locale==="en"?"zh-CN":"en";
    }
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-label","title","placeholder"]});
  }
  document.addEventListener("click",event=>{
    if(!(event.target as Element).closest("button[data-language-toggle]"))return;
    locale=locale==="en"?"zh-CN":"en";
    try{localStorage.setItem(key,locale);}catch{/* Optional preference only. */}
    apply();document.dispatchEvent(new CustomEvent("mandate:localechange",{detail:locale}));
  });
  window.addEventListener("storage",event=>{if(event.key===key&&(event.newValue==="en"||event.newValue==="zh-CN")){locale=event.newValue;apply();}});
  apply();
}
