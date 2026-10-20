// Launch one selected host with an existing Mandate connection credential.
// Does not install MCP configuration, create keys, sign or send transactions.
import {readFileSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
const [host,credentialFile,...extra]=process.argv.slice(2);
try{
  if(!['codex','claude'].includes(host)||!credentialFile||extra.length)throw Error('USAGE: node launch-host.mjs codex|claude CREDENTIAL_FILE');
  const st=statSync(credentialFile);
  if(!st.isFile()||(st.mode&0o077)!==0)throw Error('CREDENTIAL_FILE_PERMISSIONS');
  const data=JSON.parse(readFileSync(credentialFile,'utf8'));
  if(typeof data.connectionToken!=='string'||data.connectionToken.length<32||data.connectionToken.length>1024)throw Error('CONNECTION_CREDENTIAL_INVALID');
  const child=spawn(host,[],{stdio:'inherit',env:{...process.env,MANDATE_CONNECTION_TOKEN:data.connectionToken}});
  const handlers=new Map(['SIGINT','SIGTERM'].map(signal=>[signal,()=>child.kill(signal)]));
  for(const [signal,handler] of handlers)process.on(signal,handler);
  child.once('error',()=>{process.stderr.write('HOST_START_FAILED: verify the selected host is installed and on PATH.\n');process.exitCode=1;});
  child.once('exit',(code,signal)=>{
    for(const [sig,handler] of handlers)process.removeListener(sig,handler);
    process.exitCode=code??(signal==='SIGINT'?130:1);
  });
}catch(error){
  const allowed=['CREDENTIAL_FILE_PERMISSIONS','CONNECTION_CREDENTIAL_INVALID','USAGE: node launch-host.mjs codex|claude CREDENTIAL_FILE'];
  process.stderr.write((allowed.includes(error.message)?error.message:'CREDENTIAL_FILE_UNAVAILABLE')+'\n');process.exitCode=1;
}
