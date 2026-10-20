import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const C={white:'#f5f6f8',muted:'#bac5d5',blue:'#62acff'};
const names=['Mengzhong Ma','Sat Chidananda','Vrushank Ajay Ahire','Wilfried Ariel Mulyawan'];
function text(s,value,x,y,w,h,size,color=C.white,bold=false,alignment='left'){
 const a=s.shapes.add({geometry:'textbox',name:value.replaceAll('\n',' ').slice(0,80),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 a.text=value;a.text.style={typeface:'Arial',fontSize:size,color,bold,alignment,wrap:'square',autoFit:'none',insets:0,verticalAlignment:'top'};return a;
}
function rule(s,x,y,w){
 return s.shapes.add({geometry:'rect',name:'Cover team divider',position:{left:x,top:y,width:w,height:1},fill:'#62acff/45',line:{fill:'none',width:0}});
}

// Applies the visual layer to the completed 14-slide technical deck.
// Native diagrams, tables, chart data, notes and slide timings are preserved.
export async function applyVisualStyle({presentation:p,assetsDir=path.join(HERE,'assets/backgrounds')}){
 const records=(await p.inspect({kind:'textbox,shape,image',maxChars:240000})).ndjson.split('\n').filter(Boolean).map(x=>JSON.parse(x));
 const remove=records.filter(o=>(o.slideIndex===0 && ['textbox','shape','image'].includes(o.kind)) || (o.slideIndex===13 && names.some(n=>o.text?.includes(n))) || (o.slideIndex===13 && o.text==='Nanyang Technological University, Singapore') || o.name?.startsWith('Visual r3:') || o.alt?.startsWith('Visual r3:')).map(o=>o.id);
 p.delete([...new Set(remove)]);
 const hero=await fs.readFile(path.join(assetsDir,'mandate-metal-flow-hero-r3.png'));
 const body=await fs.readFile(path.join(assetsDir,'mandate-metal-flow-body-r3.png'));
 for(const [i,s] of p.slides.items.entries()){
  s.background.fill='#08090b';
  const feature=i===0||i===13;
  const bg=s.images.add({blob:feature?hero:body,contentType:'image/png',name:'Visual r3: '+(feature?'hero':'body')+' background',alt:'Visual r3: original blue-lit titanium flow background',fit:'cover',position:{left:0,top:0,width:1280,height:720}});
  bg.sendToBack();
  if(i===0)continue;
  // A translucent contrast layer keeps dense native diagrams readable.
  const shade=s.shapes.add({geometry:'rect',name:'Visual r3: contrast layer',position:{left:0,top:0,width:1280,height:720},fill:feature?'linear(0deg, #08090b/94 0%, #08090b/75 65%, #08090b/36 100%)':'#08090b/36',line:{fill:'none',width:0}});
  shade.sendToBack();bg.sendToBack();
  // Label fills were flat black in r2. Make them transparent over the new artwork.
  for(const rec of records.filter(o=>o.slideIndex===i && o.kind==='textbox')){
   if(!remove.includes(rec.id) && !rec.name?.startsWith('Diagram:')){const a=p.resolve(rec.id);a.fill='none';}
  }
 }
 const s=p.slides.items[0];
 const sourceRoot=process.env.MANDATE_SOURCE_ROOT||process.cwd();
 const logo=(await fs.readFile(path.join(sourceRoot,'mandate/web/brand/lockup.svg'),'utf8')).replaceAll('currentColor',C.white);
 s.images.add({svg:logo,alt:'Mandate wordmark',fit:'contain',position:{left:64,top:122,width:588,height:102}});
 text(s,'2026 FinTechathon  /  Topic F',69,61,780,35,23,C.blue);
 text(s,'Scoped USDC payments\nfor AI agents',69,279,760,145,53,C.white,true);
 text(s,'Mandate Labs',70,494,700,35,25,C.blue,true);
 rule(s,70,544,688);
 text(s,names[0]+', '+names[1],70,566,790,32,22);
 text(s,names[2]+', '+names[3],70,604,850,32,22);
 text(s,'Nanyang Technological University, Singapore',70,651,1000,30,20,C.muted);
 text(s,'01',1175,673,40,25,17,C.muted,false,'right');
 return {revision:'visual-r3',slides:p.slides.items.length,teamSlide:1,decorativeBackgrounds:2};
}
