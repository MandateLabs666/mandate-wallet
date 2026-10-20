import fs from 'node:fs/promises';
const ROOT=process.env.MANDATE_SOURCE_ROOT || process.cwd();
const C={bg:'#08090b',white:'#f5f6f8',muted:'#a0a5af',blue:'#62acff',line:'#354052',soft:'#192b43',amber:'#f4c47a'};
const FONT='Arial';
function text(s,v,x,y,w,h,size=26,color=C.white,bold=false,align='left',fill='none'){
 const a=s.shapes.add({geometry:'textbox',name:String(v).slice(0,70),position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}});a.text=v;a.text.style={typeface:FONT,fontSize:size,color,bold,alignment:align,wrap:'square',autoFit:'none',insets:0,verticalAlignment:'top'};return a;
}
function line(s,x1,y1,x2,y2,color=C.line,dashed=false,arrow=false){
 const reverse=x2<x1 || (x2===x1 && y2<y1);
 return s.shapes.add({geometry:'connector',name:arrow?'flow arrow':'diagram line',kind:'straight',position:{left:Math.min(x1,x2),top:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)},line:{style:dashed?'dashed':'solid',fill:color,width:arrow?2:1},...(arrow?{[reverse?'head':'tail']:{type:'triangle',width:'med',length:'med'}}:{})});
}
function route(s,points,color=C.blue,dashed=false){for(let k=1;k<points.length;k++)line(s,...points[k-1],...points[k],color,dashed,k===points.length-1);}
function node(s,title,sub,x,y,w=250,h=76,size=24,ghost=false){
 const n=s.shapes.add({geometry:'rect',name:'Diagram: '+title,position:{left:x,top:y,width:w,height:h},fill:ghost?C.bg:C.soft,line:{fill:C.line,width:1,style:ghost?'dashed':'solid'}});n.text=title+(sub?'\n'+sub:'');n.text.style={typeface:FONT,fontSize:size,color:ghost?C.muted:C.white,alignment:'center',verticalAlignment:'middle',wrap:'square',autoFit:'none',insets:7};return n;
}
function outline(s,x,y,w,h){s.shapes.add({geometry:'rect',name:'Trust boundary',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:C.line,width:1,style:'dashed'}});}
function table(s,values,x,y,w,h,widths,size=25){const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,values,columnWidths:widths});t.styleOptions={headerRow:true,bandedRows:false};t.borders.assign({fill:C.line,width:1,style:'solid'});for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){const z=t.getCell(r,c);z.fill=r?C.bg:C.soft;z.text.style={typeface:FONT,fontSize:size,color:r?C.white:C.blue,bold:r===0,insets:13,verticalAlignment:'middle',wrap:'square',autoFit:'none'};}return t;}
function base(s,info,i){if(info.id!=='cover'&&info.id!=='close')text(s,info.title,64,104,1152,78,43,C.white,true);text(s,'Mandate Labs',64,673,300,25,17,C.muted);text(s,String(i+1).padStart(2,'0'),1175,673,40,25,17,C.muted,false,'right');}
function notes(s,info){s.speakerNotes.text=info.narration+'\n\nPresenter window: '+String(info.startSeconds)+' to '+String(info.endSeconds)+' seconds ('+info.seconds+' seconds).\nChinese presenter direction (not spoken): '+info.zhHint+'\n\nSources:\n'+info.sources.join('\n');}
function sequence(s,info){const n=info.actors.length,xs=n===6?[148,345,542,739,936,1133]:[142,391,640,889,1138],w=n===6?174:190,top=198;info.actors.forEach((a,i)=>{node(s,a,'',xs[i]-w/2,top,w,67,n===6?21:22);line(s,xs[i],top+68,xs[i],642,C.line,true);});const first=n===6?295:309,gap=n===6?29:43;info.messages.forEach(([f,t,label,kind],i)=>{const y=first+i*gap;line(s,xs[f],y,xs[t],y,C.blue,kind==='dashed',true);const width=Math.max(Math.abs(xs[t]-xs[f])-16,n===6?245:330),x=Math.max(64,Math.min(1216-width,(xs[f]+xs[t]-width)/2));text(s,label,x,y-24,width,23,n===6?19.5:20,C.white,false,'center',C.bg);});}
function architecture(s){
 outline(s,464,204,322,280);outline(s,415,525,801,120);
 node(s,'Owner wallet','Rabby',64,220);node(s,'Agent host','Claude Desktop / CLI',499,220);node(s,'API merchant','402 quote and service',934,220,282);
 node(s,'Mandate workspace','Owner review',64,382);node(s,'MCP gateway','SDK + durable journal',499,382);node(s,'Facilitator','Verify and settle',934,382,282);
 node(s,'Separate verifier','Independent trust',64,548,248);node(s,'MandateAccount','Scope and reservations',451,548,309);node(s,'USDC token','Authorization and transfer',886,548,300);
 route(s,[[189,382],[189,296]]);text(s,'review / sign',201,326,170,26,20,C.white,false,'left',C.bg);
 route(s,[[624,296],[624,382]]);text(s,'stdio MCP',634,327,160,26,20,C.white,false,'left',C.bg);
 route(s,[[314,420],[499,420]]);text(s,'status API',334,391,148,26,20,C.white,false,'center',C.bg);
 route(s,[[749,420],[844,420],[844,258],[934,258]]);text(s,'HTTP / x402',786,329,140,27,19,C.white,false,'center',C.bg);
 route(s,[[1075,296],[1075,382]]);text(s,'verify / settle',1086,327,130,27,18,C.white,false,'left',C.bg);
 route(s,[[624,458],[624,548]]);text(s,'register',635,499,130,26,19,C.white,false,'left',C.bg);
 route(s,[[1075,458],[1075,548]]);text(s,'settlement',1087,499,128,26,19,C.white,false,'left',C.bg);
 route(s,[[886,586],[760,586]]);text(s,'ERC-1271',763,558,119,25,18,C.white,false,'center',C.bg);
 route(s,[[574,458],[574,511],[188,511],[188,548]],C.blue,true);text(s,'redacted evidence',245,482,245,25,19,C.white,false,'center',C.bg);
 route(s,[[64,258],[40,258],[40,650],[605,650],[605,624]]);text(s,'owner transactions',159,627,240,26,19,C.white,false,'center',C.bg);
 text(s,'Local host',650,474,120,25,18,C.muted,false,'center',C.bg);text(s,'Public chain',791,627,140,24,18,C.muted,false,'center',C.bg);
}
function evidence(s){
 text(s,'Signed headers bind scope, field root μ and the previous checkpoint digest.',64,184,1152,31,22,C.muted);
 const xs=[64,353,642,931];['Pre-payment\ncheckpoint ρ0','Registration\ncheckpoint ρ1','Payment\ncheckpoint ρ2','Service\ncheckpoint ρ3'].forEach((a,i)=>node(s,a,'',xs[i],223,238,76,24));
 for(let i=0;i<3;i++)route(s,[[xs[i]+238,261],[xs[i+1],261]]);
 node(s,'ActionProof','ρ0, R(p), D(p)',64,381,270,87,24);node(s,'Canonical chain evidence','Registration and USDC events',642,381,527,87,25);
 route(s,[[183,299],[183,381]]);route(s,[[472,299],[472,341],[761,341],[761,381]]);route(s,[[761,299],[761,381]]);
 node(s,'Independent verifier','Merkle disclosures + reviewed trust',387,525,467,77,25);
 route(s,[[199,468],[199,563],[387,563]]);route(s,[[905,468],[905,563],[854,563]]);route(s,[[1050,299],[1200,299],[1200,627],[620,627],[620,602]],C.blue,true);
 text(s,'Required financial checks: passed. Overall: incomplete.',64,637,1152,29,24,C.blue,true);
}
function host(s){
 text(s,'World A: history ends at checkpoint 2',64,216,740,38,29,C.blue,true);
 text(s,'World B: checkpoint 3 is withheld',64,395,740,38,29,C.blue,true);
 [284,463].forEach((y,row)=>{[0,1,2].forEach((v,j)=>{node(s,'h'+v,'',94+j*161,y,104,58,28);if(j<2)route(s,[[198+j*161,y+29],[255+j*161,y+29]]);});if(row===1){node(s,'h3','',610,y,104,58,28,true);route(s,[[520,y+29],[610,y+29]],C.muted,true);}});
 text(s,'Same disclosed prefix',810,287,392,52,33,C.white,true);text(s,'No independent latest head\nCompleteness remains unknown',810,368,392,95,27,C.muted);
 text(s,'An externally retained head can expose a missing known tail.',64,558,1152,36,27,C.white);
 text(s,'A query cap applies at the controller interface. The host can bypass that interface.',64,617,1152,38,22,C.muted);
}
function hyperlink(s,label,url,x,y,w,size=26){const a=text(s,label,x,y,w,42,size,C.blue);a.text=[[{run:label,style:{typeface:FONT,fontSize:size+'px',color:C.blue,underline:'sng'},link:{uri:url,isExternal:true}}]];return a;}
export async function author({presentation:p}){
 const data=JSON.parse(await fs.readFile(ROOT+'/competition/submission-2026-10-20/presentation/content.json','utf8'));
 const original=p.slides.items.slice(),snapshot=await p.inspect({kind:'slide,textbox,shape,image,table,chart',maxChars:200000});
 const records=snapshot.ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x)),slideIds=records.filter(x=>x.kind==='slide');
 const order=[0,1,2,3,4,5,6,7,11,9,8,10,12,13];p.slides.reorder(order.map(i=>slideIds.find(x=>x.slideIndex===i).id));
 const logo=(await fs.readFile(ROOT+'/mandate/web/brand/lockup.svg','utf8')).replaceAll('currentColor',C.white);
 for(let i=0;i<14;i++){
  const info=data.slides[i],old=order[i],s=p.slides.items[i];notes(s,info);
  if(i===0)continue;
  const remove=records.filter(o=>o.slideIndex===old && ['textbox','shape','image','table','chart'].includes(o.kind) && !(o.kind==='image' && o.position?.left===1015 && o.position?.top===28) && !(info.id==='evaluation' && o.kind==='chart')).map(o=>o.id);
  p.delete([...new Set(remove)]);base(s,info,i);
  switch(info.id){
   case 'problem':info.columns.forEach((v,j)=>{const x=64+j*605;text(s,v[0],x,248,535,98,40,C.blue,true);text(s,v[1],x,390,535,128,31);});text(s,'Contract checks continue when a host uses its session key directly.',64,591,1152,51,27,C.muted);break;
   case 'architecture':architecture(s);break;
   case 'case':
    info.metrics.forEach((v,j)=>{const x=64+j*391;text(s,v[0],x,246,366,109,82,C.blue,true);text(s,v[1],x,375,366,77,29);});
    text(s,'Claude Desktop + Rabby + Base Sepolia',64,507,1152,44,31,C.white,true);
    text(s,'Fixed ETH dataset. Test USDC payment. Gas uses separate test ETH.',64,575,1152,36,25,C.muted);
    text(s,'Recorded session: 2 hours. Each payment authorization: at most 5 minutes.',64,625,1152,30,22,C.muted);break;
   case 'setup-sequence':case 'payment-sequence':sequence(s,info);break;
   case 'contract':
    text(s,'occupied(root) ≤ budget(root)    occupied(session) ≤ budget(session)',64,209,1152,44,30,C.blue,true);
    table(s,info.table,64,279,1152,324,[300,852],24);
    text(s,'Concurrent 0.10 requests against 0.15: at most one reserves before release.',64,616,1152,37,25,C.muted);break;
   case 'recovery':
    table(s,info.table,64,235,1152,236,[450,210,230,262],25);text(s,'One 0.01 USDC settlement',64,522,1152,70,47,C.blue,true);
    text(s,'Same order, business nonce and transaction hash throughout recovery.',64,610,1152,36,27,C.muted);break;
   case 'research':info.rows.forEach((v,j)=>{const y=224+j*130;text(s,v[0],64,y,80,64,46,C.blue,true);text(s,v[1],177,y+3,1039,49,33,C.white,true);text(s,v[2],177,y+61,1039,42,28,C.muted);});text(s,'The release implements a bounded part of the prior proposal.',64,628,1152,33,24,C.blue);break;
   case 'evidence':evidence(s);break;
   case 'host':host(s);break;
   case 'evaluation':
    text(s,'120 tasks',64,207,430,64,48,C.blue,true);text(s,'132 settlements\n0 duplicate payments',66,282,426,90,29);
    text(s,'10,000 invalid calls',64,414,447,60,40,C.white,true);text(s,'20 explicit categories\n6 legal controls',66,484,440,85,26,C.muted);
    text(s,'Local full-task median (ms)',562,203,650,44,27,C.blue,true);
    text(s,'Local chain, n=30 per group. Setup excluded. Applicable export and verification included.',64,623,1152,34,20,C.muted);break;
   case 'public':
    [['0.01','test USDC paid once'],['0.14','final test USDC balance'],['0','new transactions after refusal']].forEach((v,j)=>{const x=64+j*391;text(s,v[0],x,217,366,90,68,C.blue,true);text(s,v[1],x,320,366,72,26);});
    hyperlink(s,'Settlement on BaseScan',info.settlement,64,440,550,29);hyperlink(s,'Session revocation on BaseScan',info.revocation,64,501,760,29);
    text(s,'Eight exported key transactions. Required financial checks passed.',64,572,1152,37,26,C.white);
    text(s,'Controlled merchant and facilitator. HTTPS source and full history remain unproven.',64,624,1152,32,22,C.muted);break;
   case 'close':
    s.images.add({svg:logo,alt:'Mandate wordmark',fit:'contain',position:{left:64,top:202,width:560,height:97}});
    text(s,'Financial scope with\nreviewable evidence',69,347,630,134,47,C.white,true);
    text(s,'Next implementation priorities',766,214,450,55,29,C.blue,true);
    text(s,'Supported installation and updates\n\nBroader merchant compatibility\n\nIndependent source and history evidence',766,296,450,221,25,C.white);
    text(s,'Beacon commitments and stronger execution proofs remain research extensions.',64,552,1152,39,24,C.muted);
    text(s,'Mengzhong Ma, Sat Chidananda, Vrushank Ajay Ahire, Wilfried Ariel Mulyawan',64,612,1152,27,20,C.white);
    text(s,'Nanyang Technological University, Singapore',64,644,1000,24,18,C.muted);break;
  }
 }
 return {slideCount:p.slides.items.length,sourceSlideOrder:order};
}
