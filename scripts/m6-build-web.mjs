import {createRequire} from "node:module";
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import "./build-case-guide.mjs";
const fromTsx=createRequire(import.meta.resolve("tsx")),esbuild=fromTsx("esbuild");
if(fromTsx("esbuild/package.json").version!=="0.27.7")throw new Error("PINNED_BROWSER_BUILDER_MISMATCH");
const directory="mandate/web/dist";mkdirSync(directory,{recursive:true});
// Optional one-time handoff from a still-running, single-profile development server.
// The old process remains alive because it may own a user's local test chain.
let setupSuccessor="";
if(process.env.MANDATE_SETUP_SUCCESSOR){
 const url=new URL(process.env.MANDATE_SETUP_SUCCESSOR);
 if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||url.pathname!=="/setup.html"||url.username||url.password||url.search||url.hash)throw Error("SETUP_SUCCESSOR_MUST_BE_LOOPBACK");
 setupSuccessor=url.href;
}
// Inline first-party vector branding at build time; no extra public routes or fonts.
const brand=Object.fromEntries(["mark","wordmark","lockup"].map(name=>[name,readFileSync(`mandate/web/brand/${name}.svg`,"utf8").trim().replace("<svg ",`<svg class="brand-vector brand-${name}" aria-hidden="true" focusable="false" `)]));
for(const name of ["index.html","app.html","docs.html","walkthrough.html","setup.html"]){
  const source=readFileSync("mandate/web/static/"+name,"utf8"),html=source.replace(/<span data-brand="(mark|wordmark|lockup)">[^<]*<\/span>/g,(_,key)=>brand[key]).replace(/(<(?:span|div)[^>]* data-brand="(mark|wordmark)"[^>]*>)[^<]*(<\/(?:span|div)>)/g,(_,open,key,close)=>open+brand[key]+close);
  if((source.match(/data-brand=/g)??[]).length!==(html.match(/class="brand-vector brand-/g)??[]).length)throw new Error("UNRESOLVED_BRAND_VECTOR");
  writeFileSync(directory+"/"+name,name==='setup.html'&&setupSuccessor?html.replace('</head>',`<meta name="mandate-setup-successor" content="${setupSuccessor}"></head>`):html);
}
const release=JSON.parse(readFileSync("mandate/web/static/contracts-release.json","utf8"));
if(createHash("sha256").update(readFileSync("mandate/web/static/mandate-contracts-v2.zip")).digest("hex")!==release.archiveSHA256)throw new Error("CONTRACT_SOURCE_ARCHIVE_MISMATCH");
for(const [path,hash] of Object.entries(release.localSourceSHA256)){
  if(!/^(mandate\/contracts\/|contracts\/lib\/|contracts\/src\/MockUSDC\.sol$)/.test(path)||path.includes("..")||createHash("sha256").update(readFileSync(path)).digest("hex")!==hash)throw new Error("CONTRACT_SOURCE_RELEASE_STALE:"+path);
}
for(const name of ["styles.css","favicon.svg","mandate-contracts-v2.zip","contracts-release.json"])copyFileSync("mandate/web/static/"+name,directory+"/"+name);
const result=await esbuild.build({entryPoints:["mandate/web/app.ts"],outfile:directory+"/app.js",bundle:true,platform:"browser",format:"esm",target:"es2022",minify:true,metafile:true});
if(Object.keys(result.metafile.inputs).some(p=>/owner-status|workspace\.ts|privateKeyToAccount|node:sqlite|gateway\/runtime/.test(p)))throw new Error("BROWSER_PRIVATE_RUNTIME_DEPENDENCY");
const setupResult=await esbuild.build({entryPoints:["mandate/onboarding/web.ts"],outfile:directory+"/setup.js",bundle:true,platform:"browser",format:"esm",target:"es2022",minify:true,metafile:true});
if(Object.keys(setupResult.metafile.inputs).some(p=>/node:|gateway\/runtime|onboarding\/(engine|hosts|server|profiles)|privateKeyToAccount/.test(p)))throw new Error("SETUP_BROWSER_PRIVATE_RUNTIME_DEPENDENCY");
const publicNames=readdirSync(directory).sort(),expectedNames=["index.html","app.html","docs.html","styles.css","favicon.svg","app.js","mandate-contracts-v2.zip","contracts-release.json","walkthrough.html","setup.html","setup.js"].sort();
if(JSON.stringify(publicNames)!==JSON.stringify(expectedNames))throw new Error("UNEXPECTED_PUBLIC_BUILD_FILE");
const fingerprints=Object.fromEntries(publicNames.map(name=>[name,createHash("sha256").update(readFileSync(directory+"/"+name)).digest("hex")]));
const reportDirectory=process.env.MANDATE_BUILD_REPORT_DIR??"artifacts/m6/build";mkdirSync(reportDirectory,{recursive:true});writeFileSync(reportDirectory+"/web.json",JSON.stringify({observedAt:new Date().toISOString(),builder:"esbuild 0.27.7",outputDirectory:directory,files:fingerprints,inputCount:Object.keys(result.metafile.inputs).length,privateRuntimeDependency:false},null,2)+"\n");console.log(JSON.stringify({files:Object.keys(fingerprints).length,privateRuntimeDependency:false}));
