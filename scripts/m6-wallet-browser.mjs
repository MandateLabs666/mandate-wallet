// Actual unmodified extension UI driver. No provider injection or wallet state mutation.
import {createRequire}from'node:module';import {resolve}from'node:path';import{readFileSync,writeFileSync,existsSync,appendFileSync}from'node:fs';import{createInterface}from'node:readline';import{randomBytes}from'node:crypto';import{nativeUI}from'./lib/native-wallet-ui.mjs';
process.umask(0o077);const r=createRequire(process.env.RUNTIME_NODE_MODULES+'/x.cjs'),{chromium}=r('playwright');
const ctx=await chromium.launchPersistentContext(resolve('.runtime/browser-wallet/profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+resolve('.runtime/browser-wallet/metamask-13.52.0'),'--load-extension='+resolve('.runtime/browser-wallet/metamask-13.52.0')],viewport:{width:1280,height:900}});
let worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');let ext=new URL(worker.url()).host,page=ctx.pages().find(p=>p.url().startsWith('chrome-extension://'));if(!page){page=await ctx.newPage();await page.goto('chrome-extension://'+ext+'/home.html');}let ui=await nativeUI(ctx,page),safe=false,appPage;const fixture=JSON.parse(readFileSync(resolve('.runtime/browser-wallet/fixture.json')));
if(fixture.chainId!==31337||new URL(fixture.origin).hostname!=='127.0.0.1'||new URL(fixture.rpc).hostname!=='127.0.0.1')throw Error('LOCAL_FIXTURE_REQUIRED');
const choose=async(p)=>{page=p;ui=await nativeUI(ctx,page);};
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
const say=v=>{
 let line=JSON.stringify({at:new Date().toISOString(),...v}).replaceAll(fixture.connectionToken,'[redacted]');
 const passwordPath=resolve('.runtime/browser-wallet/password.json');
 if(existsSync(passwordPath))line=line.replaceAll(JSON.parse(readFileSync(passwordPath)).password,'[redacted]');
 appendFileSync('.runtime/browser-wallet/ui-observations.jsonl',line+'\n',{mode:0o600});console.log(line);
};
const snapshot=async()=>({url:page.url(),safeScreenshot:safe,controls:await ui.controls()});
say({ready:true,extensionId:ext});
try{for await(const line of rl){let v;try{v=JSON.parse(line);say({command:v.op,...(v.selector?{selector:v.selector}:{})});if(v.op==='quit')break;
if(v.op==='key'){await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:v.key,code:v.key});await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:v.key,code:v.key});await new Promise(r=>setTimeout(r,500));say(await snapshot());continue;}
if(v.op==='app-open'){appPage=ctx.pages().find(p=>p.url().startsWith(fixture.origin))??await ctx.newPage();appPage.on('pageerror',e=>say({appError:e.message.replaceAll(fixture.connectionToken,'[redacted]')}));appPage.on('console',m=>{if(m.type()==='error')say({consoleError:m.text().replaceAll(fixture.connectionToken,'[redacted]')});});await appPage.bringToFront();await appPage.goto(fixture.origin+'/app.html');await appPage.locator('#credential').fill(fixture.connectionToken);await appPage.locator('#connection-form button').click();await appPage.locator('#content .metric-grid').waitFor();await choose(appPage);safe=true;say({appReady:true,provider:await appPage.evaluate(()=>Boolean(window.ethereum?.isMetaMask))});continue;}
if(v.op==='app'){await choose(appPage);safe=true;say({app:true});continue;}
if(v.op==='wallet'){const pages=ctx.pages().filter(p=>p.url().startsWith('chrome-extension://'));const target=pages.find(p=>p.url().includes('notification.html'))??pages.at(-1);await choose(target);safe=!/unlock|onboarding/.test(page.url());say(await snapshot());continue;}
if(v.op==='notification'){const p=await ctx.newPage();await p.goto('chrome-extension://'+ext+'/notification.html');await choose(p);safe=!/unlock|onboarding/.test(page.url());say(await snapshot());continue;}
if(v.op==='reload'){await page.reload();say(await snapshot());continue;}
if(v.op==='provider-read'){say(await appPage.evaluate(async()=>{const result=await Promise.race([window.ethereum.request({method:'eth_chainId'}).then(chain=>({chain})),new Promise(yes=>setTimeout(()=>yes({timeout:true}),5000))]);return result;}));continue;}
if(v.op==='pages'){say({pages:ctx.pages().map(p=>({url:p.url()}))});continue;}
if(v.op==='network'){await appPage.evaluate(({rpc})=>{window.__walletAcceptanceNetwork={state:'pending'};window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'Mandate local acceptance',rpcUrls:[rpc],nativeCurrency:{name:'Local Ether',symbol:'ETH',decimals:18}}]}).then(()=>window.__walletAcceptanceNetwork={state:'accepted'},e=>window.__walletAcceptanceNetwork={state:'rejected',code:e.code});},{rpc:fixture.rpc});say({networkRequestStarted:true});continue;}
if(v.op==='network-status'){say(await appPage.evaluate(()=>window.__walletAcceptanceNetwork));continue;}
if(v.op==='click-app'){await appPage.locator(v.selector).first().click();say({appClicked:v.selector});continue;}
if(v.op==='fill-app'){if(!['#task-description','#task-budget','#task-max','#task-ttl'].includes(v.selector))throw Error('APP_FORM_FIELD_NOT_ALLOWED');await appPage.locator(v.selector).fill(v.value);say({appFilled:v.selector});continue;}
if(v.op==='viewport'){await appPage.setViewportSize({width:v.width,height:v.height});say({viewport:v.width});continue;}
if(v.op==='app-snapshot'){say({url:appPage.url(),text:(await appPage.locator('body').innerText()).replaceAll(fixture.connectionToken,'[redacted]'),overflow:await appPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),provider:await appPage.evaluate(()=>Boolean(window.ethereum?.isMetaMask))});continue;}
if(v.op==='drop-owner-report'){
 let dropped=false;
 await appPage.route('**/api/workspace',async route=>{
   if(!dropped&&route.request().postDataJSON()?.operation==='owner-broadcast'){
     dropped=true;say({simulatedFailure:'owner-broadcast-report-network-abort-once'});await route.abort('failed');
   }else await route.continue();
 });say({ownerBroadcastReportFaultArmed:true,paymentOrWalletRPCIntercepted:false});continue;
}
if(v.op==='submission-state'){
 say({submissions:await appPage.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mandate-owner-v2/')).map(k=>JSON.parse(localStorage.getItem(k))))});continue;
}
if(v.op==='responsive-audit'){
 const checks=[];
 for(const width of [1280,390]){
   await appPage.setViewportSize({width,height:900});
   for(const name of ['overview','tasks','mandates','services','payments','evidence','security']){
     await appPage.locator(`[data-page=${name}]`).click();await new Promise(yes=>setTimeout(yes,100));
     const overflow=await appPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
     checks.push({width,page:name,overflow});
     await appPage.screenshot({path:resolve(`.runtime/browser-wallet/responsive-${width}-${name}.png`),fullPage:true});
   }
 }
 say({responsive:checks,allNoPageOverflow:checks.every(c=>!c.overflow),physicalMobileDevice:false});continue;
}
if(v.op==='snapshot'){say(await snapshot());continue;}
if(v.op==='click'){await ui.click(v.role,v.name);await new Promise(r=>setTimeout(r,600));say(await snapshot());continue;}
if(v.op==='seed-type'){if(!page.url().startsWith('chrome-extension://'+ext+'/home.html#/onboarding/import-with-recovery-phrase'))throw Error('FIXTURE_SEED_ROUTE_REQUIRED');safe=false;const{TEST_MNEMONIC}=await import('../mandate/examples/local-node.ts');const box=(await ui.controls()).find(n=>n.role==='textbox');await ui.fill('textbox',box.name,'');await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2});await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace'});await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace'});for(const letter of TEST_MNEMONIC){await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:letter,text:letter,unmodifiedText:letter});await ui.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:letter});}say({fixtureTyped:true,exported:false});continue;}
if(v.op==='password'){
 if(!page.url().startsWith('chrome-extension://'+ext+'/')||!/unlock|create-password/.test(page.url()))throw Error('WALLET_PASSWORD_ROUTE_REQUIRED');safe=false;const f=resolve('.runtime/browser-wallet/password.json');if(!existsSync(f))writeFileSync(f,JSON.stringify({password:randomBytes(24).toString('hex')}),{mode:0o600});const password=JSON.parse(readFileSync(f)).password;await ui.fill(v.role??'textbox',v.name,password);say({passwordEntered:true,exported:false});continue;}
if(v.op==='shot'){if(!/^[a-z0-9-]+$/.test(v.name))throw Error('INVALID_SHOT_NAME');if(!safe||/unlock|onboarding/.test(page.url()))throw Error('PRIVATE_ENTRY_SCREENSHOT_DISABLED');const shot=await ui.cdp.send('Page.captureScreenshot',{format:'png'});writeFileSync('.runtime/browser-wallet/'+v.name+'.png',Buffer.from(shot.data,'base64'));say({saved:true});continue;}
if(v.op==='public-stage'){if(/unlock|onboarding|import-srp|import-with|recovery-phrase|create-password/.test(page.url()))throw Error('STILL_PRIVATE_ENTRY_ROUTE');safe=true;say(await snapshot());continue;}
throw Error('UNSUPPORTED_UI_COMMAND');
}catch(e){say({error:e.message?.startsWith('UI_')?e.message:'WALLET_TEST_COMMAND_FAILED',op:v?.op});}}
}finally{await ctx.close();rl.close();}
