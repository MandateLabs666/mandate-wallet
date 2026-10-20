// Test-only private Site access. Browser HTTP and response bytes remain native.
import {createHash} from "node:crypto";
import {createServer} from "node:http";
export async function hiddenSiteInput(expectedOrigin:string){
 if(!process.stdin.isTTY)throw Error("HIDDEN_INPUT_TERMINAL_REQUIRED");process.stdin.setRawMode(true);process.stdin.resume();console.log("Ready for Site dispatch JSON on stdin (input is hidden).");
 const input=await new Promise<{siteOrigin:string;dispatchToken:string;appSHA256:string}>((yes,no)=>{let text="";const cleanup=()=>{process.stdin.off("data",onData);process.stdin.setRawMode(false);process.stdin.pause();};const onData=(chunk:Buffer)=>{text+=chunk.toString();if(text.length>20000){cleanup();return no(Error("INPUT_TOO_LARGE"));}if(text.includes("\n")){cleanup();try{yes(JSON.parse(text.trim()));}catch{no(Error("PRIVATE_INPUT_INVALID"));}}};process.stdin.on("data",onData);});
 if(input.siteOrigin!==expectedOrigin||!input.siteOrigin.startsWith("https://")||!input.dispatchToken||!/^[0-9a-f]{64}$/.test(input.appSHA256))throw Error("SITE_SCOPE_MISMATCH");return input;
}
export async function bounded<T>(work:Promise<T>,label:string,ms=15000){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,no)=>{timer=setTimeout(()=>no(Error("TEST_TIMEOUT:"+label)),ms);})]);}finally{clearTimeout(timer);}}
export async function siteAccess(context:any,page:any,input:{siteOrigin:string;dispatchToken:string},runControl=true,processAudit?:{profileMatched:boolean;commandArguments:string[]}){
 const cdp:any=await bounded(context.newCDPSession(page),"CDP-session"),protocol=(name:string,args:Record<string,unknown>={})=>bounded<any>(cdp.send(name,args),name);
 const version=await protocol("Browser.getVersion"),command=processAudit?.profileMatched?{arguments:processAudit.commandArguments}:await protocol("Browser.getBrowserCommandLine");
 const unsafe=command.arguments.filter((s:string)=>/disable-web-security|allow-running-insecure-content|LocalNetworkAccess|loopback|private-network|PrivateNetworkAccess/i.test(s));if(unsafe.length)throw Error("BROWSER_SECURITY_BYPASS_NOT_ALLOWED");
 for(const name of ["local-network-access","loopback-network"])await protocol("Browser.setPermission",{permission:{name},setting:"granted",origin:input.siteOrigin});
 const credentials=new Map<string,string>([[input.siteOrigin,input.dispatchToken]]),origins=new Map<string,string>(),redirects:any[]=[],errors:string[]=[];let rejected=0;
 cdp.on("Fetch.requestPaused",async(v:any)=>{try{const origin=new URL(v.request.url).origin;origins.set(v.requestId,origin);if(v.redirectedRequestId){const from=origins.get(v.redirectedRequestId),blocked=from!==origin;redirects.push({from:from??null,to:origin,blocked});if(blocked){rejected++;await protocol("Fetch.failRequest",{requestId:v.requestId,errorReason:"BlockedByClient"});return;}}
  const credential=credentials.get(origin);if(credential){const headers=Object.entries(v.request.headers).filter(([k])=>k.toLowerCase()!=="oai-sites-authorization").map(([name,value])=>({name,value:String(value)}));headers.push({name:"OAI-Sites-Authorization",value:"Bearer "+credential});await protocol("Fetch.continueRequest",{requestId:v.requestId,headers});}
  else{if(Object.keys(v.request.headers).some(k=>k.toLowerCase()==="oai-sites-authorization"))throw Error("UNSCOPED_SITE_HEADER");await protocol("Fetch.continueRequest",{requestId:v.requestId});}
 }catch{errors.push("FETCH_INTERCEPTION_FAILED");await protocol("Fetch.failRequest",{requestId:v.requestId,errorReason:"BlockedByClient"}).catch(()=>{});}});
 await protocol("Fetch.enable",{patterns:[{urlPattern:"http://*",requestStage:"Request"},{urlPattern:"https://*",requestStage:"Request"}]});
 let redirectControl:any=null;
 if(runControl){
 let destinationHits=0,sourceHeaderMatched=false,redirectRejected=false,testOrigin="";const canary="redirect-control-canary",destination=createServer((_q,r)=>{destinationHits++;r.end("unexpected");}),source=createServer((q,r)=>{if(q.url!=="/redirect"){r.writeHead(200,{"content-type":"text/html"});r.end("<!doctype html><title>Redirect control</title>");return;}sourceHeaderMatched=q.headers['oai-sites-authorization']==="Bearer "+canary;r.writeHead(302,{location:"http://127.0.0.1:"+(destination.address() as any).port+"/destination"});r.end();});
 const listen=(s:ReturnType<typeof createServer>)=>new Promise<void>(yes=>s.listen(0,"127.0.0.1",yes));
 try{await listen(destination);await listen(source);testOrigin="http://127.0.0.1:"+(source.address() as any).port;credentials.set(testOrigin,canary);await page.goto(testOrigin+"/source",{waitUntil:"load",timeout:15000});const failed=await bounded<boolean>(page.evaluate(async(url:string)=>{try{await fetch(url,{mode:"no-cors",redirect:"follow"});return false;}catch{return true;}},testOrigin+"/redirect"),"redirect-control");redirectRejected=failed&&rejected===1;}
 finally{credentials.delete(testOrigin);source.closeAllConnections();destination.closeAllConnections();await Promise.all([new Promise(yes=>source.close(yes)),new Promise(yes=>destination.close(yes))]);}
 redirectControl={sourceHeaderMatched,redirectRejected,destinationHits,realSiteCredentialUsed:false};if(!sourceHeaderMatched||!redirectRejected||destinationHits||errors.length)throw Error("SITE_REDIRECT_CONTROL_FAILED");
 }
 return {cdp,protocol,browserVersion:version.product,securityAuditSource:processAudit?.profileMatched?"owned OS process argv":"Browser.getBrowserCommandLine",securityBypassFlags:unsafe,redirectControl,redirects,errors,stopSourceInterception:async()=>{await protocol("Fetch.disable");credentials.clear();}};
}
export async function hostedPage(page:any,input:{siteOrigin:string;appSHA256:string},expectedHTML:Buffer){
 const sha=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex"),assets:any[]=[];
 page.on("response",async(r:any)=>{if(new URL(r.url()).origin===input.siteOrigin&&new URL(r.url()).pathname==="/app.js"){try{assets.push({status:r.status(),SHA256:sha(await bounded<Buffer>(r.body(),"app-body"))});}catch{assets.push({bodyReadFailed:true});}}});
 const response=await page.goto(input.siteOrigin+"/app.html",{waitUntil:"networkidle",timeout:45000});if(response.status()!==200||new URL(page.url()).origin!==input.siteOrigin)throw Error("HOSTED_PAGE_UNAVAILABLE");
 const body=await bounded<Buffer>(response.body(),"HTML-body"),text=body.toString(),expected=sha(expectedHTML);let injection:null|{templateSHA256:string;removedFromExecutedPage:boolean}=null;
 if(sha(body)!==expected){const scripts=[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];if(scripts.length!==1)throw Error("HOSTED_HTML_SOURCE_MISMATCH");const tag=scripts[0][0],script=scripts[0][1],fields=script.match(/r:'[0-9a-f]{16}',t:'[A-Za-z0-9+/=]{12,40}'/g);if(fields?.length!==1)throw Error("HOSTED_PLATFORM_TEMPLATE_MISMATCH");const hash=sha(script.replace(fields[0],"r:'[RAY]',t:'[TIME]'"));if(hash!=="19e0cdb4365ec315008fc3c6cbbc655f9928f879308ab095ed870999557d8e08"||sha(text.replace(tag,""))!==expected)throw Error("HOSTED_HTML_SOURCE_MISMATCH");injection={templateSHA256:hash,removedFromExecutedPage:false};}
 await page.locator("#connection-form").waitFor();await page.waitForTimeout(150);if(assets.length!==1||assets[0].SHA256!==input.appSHA256)throw Error("HOSTED_JS_SOURCE_MISMATCH");
 return {hostedOrigin:input.siteOrigin,app:assets[0],uploadedHTMLSHA256:expected,responseHTMLSHA256:sha(body),platformInjection:injection,responseBytesReplaced:false};
}
