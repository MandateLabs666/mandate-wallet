import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mnemonicToAccount} from 'viem/accounts';
import {toHex,createPublicClient,http,decodeFunctionData,parseEventLogs} from 'viem';
import {TEST_MNEMONIC} from '../../mandate/examples/local-node.ts';
import {accountAbi} from '../../mandate/sdk/accountAbi.ts';
import {nativeUI} from '../../scripts/lib/native-wallet-ui.mjs';
process.umask(0o077);
const run=process.argv[2];if(!run||!/^[a-z0-9-]+$/.test(run))throw Error('FRESH_RUN_REQUIRED');
const out=resolve('.runtime/rabby-wallet',run);if(existsSync(out))throw Error('RUN_EXISTS');mkdirSync(out,{mode:0o700});
const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{mode:0o600});
const password=randomBytes(24).toString('hex'),testKey=toHex(mnemonicToAccount(TEST_MNEMONIC).getHdKey().privateKey);
const extension=resolve('.runtime/rabby-wallet/extension-0.94.12'),zip=resolve('.runtime/rabby-wallet/Rabby_v0.94.12.zip');
if(createHash('sha256').update(readFileSync(zip)).digest('hex')!=='e1132d749d4f34d3c7a870dfcfc07ecfef1b6030a1c386c28747e8e16417aa39')throw Error('OFFICIAL_ARCHIVE_MISMATCH');
execFileSync('python3',['-c',"import sys,zipfile;from pathlib import Path\nz=zipfile.ZipFile(sys.argv[1]);d=Path(sys.argv[2]);names=[n for n in z.namelist() if not n.endswith('/')];assert len(names)==1153;assert set(names)=={str(p.relative_to(d)) for p in d.rglob('*') if p.is_file()};assert all((d/n).read_bytes()==z.read(n) for n in names)",zip,extension]);
let child,ctx,rl,fixture,app,wallet,ui,pc,review;
const wait=ms=>new Promise(r=>setTimeout(r,ms));let closing=false;
const close=async()=>{if(closing)return;closing=true;rl?.close();await ctx?.close().catch(()=>{});if(child&&child.exitCode===null){child.stdin.end('stop\n');await Promise.race([new Promise(r=>child.once('exit',r)),wait(4000)]);if(child.exitCode===null)child.kill('SIGTERM');}};
const deadline=setTimeout(()=>{console.log(JSON.stringify({timeout:true}));void close();},15*60*1000);
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
const redacted=s=>[password,testKey,TEST_MNEMONIC,fixture?.connectionToken].filter(Boolean).reduce((s,k)=>s.replaceAll(k,'[REDACTED]'),String(s));
try{
 child=spawn(process.execPath,['--import','tsx','mandate/experiments/m6-wallet-fixture.ts'],{env:{PATH:process.env.PATH??'',MANDATE_WALLET_FIXTURE_DIR:join(out,'fixture')},stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);
 await new Promise((yes,no)=>{let s='';const timer=setTimeout(()=>no(Error('FIXTURE_TIMEOUT')),30000);child.stdout.on('data',d=>{s+=d;for(const line of s.split('\n'))try{if(JSON.parse(line).ready){clearTimeout(timer);yes();}}catch{}});child.once('exit',()=>{clearTimeout(timer);writeFileSync(join(out,'fixture-private-error.txt'),stderr,{mode:0o600});no(Error('FIXTURE_EXIT'));});});
 fixture=JSON.parse(readFileSync(join(out,'fixture/fixture.json'),'utf8'));if(fixture.chainId!==31337||new URL(fixture.rpc).hostname!=='127.0.0.1')throw Error('ONLY_LOCAL_CHAIN_ALLOWED');
 pc=createPublicClient({transport:http(fixture.rpc,{retryCount:0,timeout:5000})});if(await pc.getChainId()!==31337)throw Error('CHAIN_MISMATCH');
 const before={ownerNonce:await pc.getTransactionCount({address:fixture.owner})};save('before.json',before);
 const {chromium}=createRequire(join(process.env.RUNTIME_NODE_MODULES,'x.cjs'))('playwright');
 ctx=await chromium.launchPersistentContext(join(out,'profile'),{channel:'chromium',headless:true,args:['--password-store=basic','--use-mock-keychain','--disable-extensions-except='+extension,'--load-extension='+extension],viewport:{width:1280,height:900},timeout:30000});ctx.setDefaultTimeout(15000);
 const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker',{timeout:20000}),id=new URL(worker.url()).host;
 wallet=ctx.pages().find(p=>p.url().startsWith('chrome-extension://'))??await ctx.newPage();await wallet.goto(`chrome-extension://${id}/index.html`);ui=await nativeUI(ctx,wallet);
 const clickReady=async(role,name)=>{for(let i=0;i<80;i++){const matches=(await ui.nodes()).filter(c=>c.role===role&&c.name===name&&!c.properties.some(p=>p.name==='disabled'&&p.value.value===true));if(matches.length===1){await ui.click(role,name);await wait(350);return;}await wait(150);}throw Error('CONTROL_TIMEOUT:'+name);};
 if(process.argv.includes('--bootstrap')){
  await wallet.goto(`chrome-extension://${id}/index.html#/new-user/guide`);
  await clickReady('button','I already have an address');await clickReady('StaticText','Seed Phrase or Private Key');await clickReady('StaticText','Private Key');
  await ui.fill('textbox','Input private key',testKey);await clickReady('button',' Next');
  await ui.fill('textbox','Password (8 characters min)',password);await ui.fill('textbox','Confirm Password',password);await clickReady('button',' Confirm');await clickReady('button','Open Wallet');
 }
 console.log(JSON.stringify({ready:true,headless:true,freshProfile:true,mockKeychain:true,extension:id,chainId:31337,newPublicTransactions:0}));
 const api=async(operation,args={})=>{const r=await fetch(fixture.origin+'/api/workspace',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+fixture.connectionToken},body:JSON.stringify({operation,...args}),signal:AbortSignal.timeout(10000)});const v=await r.json();if(!r.ok)throw Error('API_REJECTED:'+v.code);return v;};
 const safeControls=async()=>JSON.parse(redacted(JSON.stringify(await ui.controls())));
 rl=createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const line of rl){let command;try{command=JSON.parse(line);}catch{continue;}
  try{
   const c=command;let result;
   if(c.action==='stop')break;
   if(c.action==='controls')result={url:wallet.url(),controls:await safeControls()};
   else if(c.action==='text')result=redacted((await ui.nodes()).filter(n=>['heading','StaticText'].includes(n.role)).map(n=>n.name).join('\n'));
   else if(c.action==='click'){await ui.click(c.role,c.name);await wait(500);result={controls:await safeControls()};}
   else if(c.action==='click-node'){await ui.cdp.send('DOM.scrollIntoViewIfNeeded',{backendNodeId:c.id});const {model}=await ui.cdp.send('DOM.getBoxModel',{backendNodeId:c.id}),q=model.content,x=(q[0]+q[2]+q[4]+q[6])/4,y=(q[1]+q[3]+q[5]+q[7])/4;for(const type of ['mousePressed','mouseReleased'])await ui.cdp.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await wait(500);result={controls:await safeControls()};}
   else if(c.action==='fill'){const value=c.source==='test-key'?testKey:c.source==='test-password'?password:c.source==='rpc'?fixture.rpc:String(c.value??'');if(c.id){await ui.cdp.send('DOM.focus',{backendNodeId:c.id});await ui.cdp.send('Input.insertText',{text:value});}else await ui.fill(c.role??'textbox',c.name,value);result={filled:true};}
   else if(c.action==='ack-local-connect'){
    const source=readFileSync('.runtime/rabby-wallet/official-source/src__ui__views__Approval__components__Connect__ConnectContent.tsx','utf8');
    if(!source.includes('const [processedRules, setProcessedRules] = useState<string[]>([])')||!source.includes('const onIgnoreAllRules = () => {\n    setProcessedRules(engineResults.map((item) => item.id));\n  };'))throw Error('CURRENT_REQUEST_SCOPE_UNVERIFIED');
    const text=(await ui.nodes()).filter(n=>n.role==='StaticText').map(n=>n.name).join('\n');
    if(!wallet.url().endsWith('/notification.html#/approval')||!text.includes(fixture.origin)||!text.includes('Very Low')||/phishing|flagged|malicious|forbidden/i.test(text))throw Error('LOCAL_CONNECTION_WARNING_SCOPE_MISMATCH');
    save('current-connection-alert-review.json',{origin:fixture.origin,officialSource:'https://github.com/RabbyHub/Rabby/blob/v0.94.12/src/ui/views/Approval/components/Connect/ConnectContent.tsx',sourceSHA256:createHash('sha256').update(source).digest('hex'),scope:'React useState processedRules in this connection request only',persistentRuleSettingsChanged:false,alertText:text});
    await ui.click('StaticText','Ignore all');await wait(500);result={currentRequestOnly:true,persistentRuleSettingsChanged:false,controls:await safeControls()};
   }
   else if(c.action==='pages')result=ctx.pages().map((p,index)=>({index,url:p.url()}));
   else if(c.action==='select'){wallet=ctx.pages()[c.index];ui=await nativeUI(ctx,wallet);result={url:wallet.url(),controls:await safeControls()};}
   else if(c.action==='app'){app=await ctx.newPage();await app.goto(fixture.origin+'/app.html');await app.locator('#credential').fill(fixture.connectionToken);await app.locator('#connection-form button').click();await app.locator('#content .metric-grid').waitFor();result={connected:true,realRabby:await app.evaluate(()=>Boolean(window.ethereum?.isRabby))};}
   else if(c.action==='connect'){await app.locator('#connect-owner').click();await wait(500);result={error:await app.locator('#error').innerText(),button:await app.locator('#connect-owner').innerText()};}
   else if(c.action==='network'){await app.evaluate(({rpc})=>{window.__network={pending:true};window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'Mandate Local',rpcUrls:[rpc],nativeCurrency:{name:'Local Ether',symbol:'ETH',decimals:18}}]}).then(v=>window.__network={done:true,value:v},e=>window.__network={error:{code:e.code,message:e.message}});},{rpc:fixture.rpc});result={requested:true};}
   else if(c.action==='switch'){await app.evaluate(()=>{window.__switch={pending:true};window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x7a69'}]}).then(v=>window.__switch={done:true,value:v},e=>window.__switch={error:{code:e.code,message:e.message}});});result={requested:true};}
   else if(c.action==='status')result={error:await app.locator('#error').innerText(),ownerButton:await app.locator('#connect-owner').innerText(),network:await app.evaluate(()=>({network:window.__network,switch:window.__switch})),ownerNonce:await pc.getTransactionCount({address:fixture.owner}),before};
   else if(c.action==='draft'){const response=app.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().postDataJSON()?.operation==='owner-action');await app.locator('[data-action="pause"]').first().click();review=await(await response).json();await app.locator('#review').waitFor();result={draft:review.request.draft,approveDisabled:await app.locator('#approve').isDisabled(),error:await app.locator('#review-error').innerText()};save('review.json',review);}
   else if(c.action==='review-connect'){await app.locator('#connect-review-owner').click();await wait(500);result={approveDisabled:await app.locator('#approve').isDisabled(),error:await app.locator('#review-error').innerText()};}
   else if(c.action==='approve'){await app.locator('#approve').click();result={requested:true};}
   else if(c.action==='reconcile'){const status=await api('owner-request',{requestId:review.request.requestId});let transaction;if(status.transactionHash){const tx=await pc.getTransaction({hash:status.transactionHash}),receipt=await pc.getTransactionReceipt({hash:tx.hash});transaction={hash:tx.hash,from:tx.from,to:tx.to,input:tx.input,value:tx.value,nonce:tx.nonce,chainId:tx.chainId,status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed,method:decodeFunctionData({abi:accountAbi,data:tx.input}).functionName,events:parseEventLogs({abi:accountAbi,logs:receipt.logs.filter(l=>l.address.toLowerCase()===fixture.wallet.toLowerCase())}).map(e=>({name:e.eventName,args:e.args}))};}
    result={status,transaction,before,ownerNonceAfter:await pc.getTransactionCount({address:fixture.owner}),newPublicTransactions:0};save('owner-result.json',result);
   }else throw Error('UNKNOWN_ACTION');
   console.log(JSON.stringify({action:c.action,result},(_,v)=>typeof v==='bigint'?String(v):v));
  }catch(e){console.log(JSON.stringify({action:command?.action,error:redacted(e.message)}));}
 }
}catch(e){save('failure.json',{code:redacted(e.message),newPublicTransactions:0});console.log(JSON.stringify({failed:true,code:redacted(e.message)}));process.exitCode=1;}
finally{clearTimeout(deadline);await close();console.log(JSON.stringify({closed:true}));}
