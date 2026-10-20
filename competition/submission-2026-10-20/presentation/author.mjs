import fs from 'node:fs/promises';
const ROOT=process.env.MANDATE_SOURCE_ROOT || process.cwd();
const C={bg:'#08090b',white:'#f5f6f8',muted:'#a0a5af',blue:'#62acff',line:'#354052',soft:'#192b43',amber:'#f4c47a'};
const font='Arial';
function text(s,value,x,y,w,h,size=26,color=C.white,bold=false,align='left',fill='none'){
 const t=s.shapes.add({geometry:'textbox',name:value.slice(0,65),position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}});t.text=value;t.text.style={typeface:font,fontSize:size,color,bold,alignment:align,wrap:'square',autoFit:'none',insets:0,verticalAlignment:'top'};return t;
}
function line(s,x1,y1,x2,y2,color=C.line,dashed=false,arrow=false){
 const left=Math.min(x1,x2),top=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1);
 return s.shapes.add({geometry:'connector',kind:'straight',position:{left,top,width:w,height:h},line:{style:dashed?'dashed':'solid',fill:color,width:arrow?2:1},...(arrow?(x2>=x1?{tail:{type:'triangle',width:'med',length:'med'}}:{head:{type:'triangle',width:'med',length:'med'}}):{})});
}
function table(s,values,x=64,y=210,w=1152,h=375,widths){
 const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,values,columnWidths:widths});t.styleOptions={headerRow:true,bandedRows:false};t.borders.assign({fill:C.line,width:1,style:'solid'});
 for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.soft:C.bg;cell.text.style={typeface:font,fontSize:r===0?24:24,color:r===0?C.blue:C.white,bold:r===0,insets:14,verticalAlignment:'middle',wrap:'square',autoFit:'none'};}return t;
}
async function image(s,path,x,y,w,h,crop){s.images.add({blob:new Uint8Array(await fs.readFile(ROOT+'/'+path)),contentType:path.endsWith('.png')?'image/png':'image/jpeg',alt:path,fit:'contain',position:{left:x,top:y,width:w,height:h},...(crop?{crop}: {})});}
async function base(p,info,index,logo){const s=p.slides.add({width:1280,height:720});s.background.fill=C.bg;s.images.add({svg:logo,alt:'Mandate website wordmark',fit:'contain',position:{left:1015,top:28,width:200,height:35}});if(info.id!=='cover'&&info.id!=='close')text(s,info.title,64,104,1152,78,43,C.white,true);if(info.id!=='cover')text(s,'Mandate Labs',64,673,300,25,17,C.muted);text(s,String(index+1).padStart(2,'0'),1175,673,40,25,17,C.muted,false,'right');s.speakerNotes.text=info.narration+'\n\nPresenter timing: '+info.seconds+' seconds.\nChinese cue: '+info.zhHint+'\n\nSources (repository-relative):\n'+info.sources.join('\n');return s;}
function sequence(s,info){
 const n=info.actors.length,xs=info.actors.map((_,i)=>142+i*249),top=206;
 info.actors.forEach((a,i)=>{const r=s.shapes.add({geometry:'rect',position:{left:xs[i]-95,top:top-5,width:190,height:68},fill:C.soft,line:{fill:C.line,width:1}});r.text=a;r.text.style={typeface:font,fontSize:22,bold:true,color:C.white,alignment:'center',verticalAlignment:'middle',insets:6};line(s,xs[i],top+65,xs[i],641,C.line,true);});
 const gap=info.messages.length===9?39:44;
 info.messages.forEach(([from,to,label,style],i)=>{const yy=306+i*gap;line(s,xs[from],yy,xs[to],yy,C.blue,style==='dashed',true);const wid=Math.min(600,Math.max(Math.abs(xs[to]-xs[from])-20,330)),xx=Math.max(62,Math.min(1218-wid,(xs[to]+xs[from]-wid)/2));text(s,label,xx,yy-29,wid,27,20,C.white,false,'center',C.bg);});
}
export async function author({presentation,input}){
 const data=JSON.parse(await fs.readFile(ROOT+'/competition/submission-2026-10-20/presentation/content.json','utf8'));
 const logo=(await fs.readFile(ROOT+'/mandate/web/brand/lockup.svg','utf8')).replaceAll('currentColor',C.white);
 const mark=(await fs.readFile(ROOT+'/mandate/web/brand/mark.svg','utf8')).replaceAll('currentColor',C.blue);
 for(let i=input.start;i<input.end;i++){
  const info=data.slides[i],s=await base(presentation,info,i,logo);
  switch(info.id){
   case 'cover':
    s.images.add({svg:logo,alt:'Mandate wordmark',position:{left:64,top:185,width:650,height:113},fit:'contain'});
    text(s,'Scoped USDC payments\nfor AI agents',70,334,730,154,53,C.white,true);
    text(s,'2026 FinTechathon  /  Topic F',72,535,780,45,25,C.blue);
    text(s,'Mandate Labs',72,594,700,36,23,C.muted);
    s.images.add({svg:mark,alt:'Original Mandate wallet icon',position:{left:896,top:245,width:290,height:290},fit:'contain'});break;
   case 'problem':
    info.columns.forEach((v,j)=>{const x=64+j*605;text(s,v[0],x,250,535,110,40,C.blue,true);text(s,v[1],x,398,535,137,31);});
    text(s,'The contract enforces the financial boundary during execution.',64,592,1152,60,27,C.muted);break;
   case 'product':
    await image(s,'artifacts/m6/ui-refresh/r4/home-en.jpg',64,200,820,425);
    text(s,'Owner workspace',925,231,300,38,28,C.blue,true);text(s,'Review permissions\nand payment outcomes',925,278,300,75,25);
    text(s,'Claude Desktop MCP',925,388,300,38,28,C.blue,true);text(s,'Run the approved task\nthrough a local gateway',925,435,300,75,25);
    text(s,'Owner keys remain\nin the external wallet',925,556,300,74,24,C.muted);break;
   case 'case':
    info.metrics.forEach((m,j)=>{text(s,m[0],64,208+j*133,390,78,64,C.blue,true);text(s,m[1],67,286+j*133,415,36,25);});
    await image(s,'competition/submission-2026-10-20/presentation/assets/claude-case.jpg',516,247,700,265,{left:.294,top:.55,right:.28,bottom:.22});
    text(s,'Fixed sample dataset. Purchases use test USDC.',514,617,695,42,22,C.muted);break;
   case 'setup-sequence':case 'payment-sequence':sequence(s,info);break;
   case 'contract':table(s,info.table,64,208,1152,415,[330,822]);break;
   case 'recovery':
    table(s,info.table,64,225,1152,245,[426,242,242,242]);
    text(s,'0.01 test USDC',64,522,640,77,53,C.blue,true);text(s,'One settlement hash. One payment nonce.',64,607,1152,43,28,C.muted);break;
   case 'revocation':
    text(s,'Session revoked',64,232,500,59,40,C.blue,true);text(s,'Unused BTC step rejected\nbefore registration',64,328,480,94,32);
    text(s,'0 new transactions',64,464,475,62,40,C.white,true);text(s,'0.14 test USDC remains',64,558,480,47,29,C.muted);
    await image(s,'competition/video/claude-desktop-base-v1/final-wallet-state.png',552,218,665,402,{left:.18,top:.13,right:.07,bottom:.12});break;
   case 'evidence':
    table(s,info.table,64,219,1152,330,[600,552]);
    text(s,'Required financial checks passed. Overall report: incomplete.',64,588,1152,54,30,C.blue,true);break;
   case 'evaluation':{
    text(s,'120 tasks',64,207,430,64,48,C.blue,true);text(s,'132 settlements; no duplicate payments',66,277,426,78,27);
    text(s,'10,000 invalid calls',64,405,447,62,42,C.white,true);text(s,'20 explicit invalid categories\n6 legal controls',66,476,440,94,26,C.muted);
    text(s,'Local full-task median (ms)',562,203,650,44,27,C.blue,true);
    const ch=s.charts.add('bar',{position:{left:550,top:271,width:666,height:320},categories:info.categories,series:[{name:'Milliseconds',values:info.chartValues,fill:C.blue}],hasLegend:false,barOptions:{direction:'column',grouping:'clustered',gapWidth:100},chartFill:C.bg,plotAreaFill:C.bg,xAxis:{textStyle:{fontSize:19,fill:C.white},line:{fill:C.line,width:1}},yAxis:{min:0,max:450,textStyle:{fontSize:20,fill:C.muted},majorGridlines:{fill:C.line,width:1}},dataLabels:{showValue:true,position:'outEnd',numberFormatCode:'0.00',textStyle:{fontSize:21,fill:C.white}}});
    const utils=await import('/Users/jeff/.codex/plugins/cache/openai-primary-runtime/presentations/26.1017.31632/skills/presentations/container_tools/artifact_tool_utils.mjs');utils.applyPresentationChartFont(ch,{fontFamily:font});
    text(s,'n=30 per group on a local chain. Setup excluded; export/verification included where applicable.',64,620,1152,40,19,C.muted);break;}
   case 'provenance':table(s,info.table,64,218,1152,355,[330,822]);text(s,'The proposal motivates the research; its complete intended guarantees remain outside this delivery.',64,607,1152,45,23,C.muted);break;
   case 'release':
    info.columns.forEach((v,j)=>{const x=64+j*605;text(s,v[0],x,235,535,90,38,C.blue,true);text(s,v[1],x,350,535,190,30);});
    text(s,'Testnet engineering release. Mainnet and an external human security audit remain pending.',64,608,1152,45,23,C.muted);break;
   case 'close':
    s.images.add({svg:logo,alt:'Mandate wordmark',position:{left:64,top:205,width:690,height:120},fit:'contain'});
    text(s,'Agent commerce\non your terms',70,367,1000,150,58,C.white,true);
    text(s,'Owner-approved scope with reviewable payment outcomes',72,559,1100,62,30,C.blue);
    break;
  }
 }
 return {slideCount:presentation.slides.items.length};
}
