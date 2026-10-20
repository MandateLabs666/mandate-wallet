import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const launcher=fileURLToPath(new URL('./launch-host.mjs',import.meta.url));
function runCase(fn){const dir=mkdtempSync(join(tmpdir(),'mandate-manual-host-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
function mockHost(dir,name){
 const bin=join(dir,'bin');mkdirSync(bin,{recursive:true});
 writeFileSync(join(bin,name),'#!'+process.execPath+'\nconsole.log(JSON.stringify({tokenPresent:process.env.MANDATE_CONNECTION_TOKEN==="PUBLIC_LOCAL_CASE_TOKEN_"+"q".repeat(32),args:process.argv.slice(2)}));process.exit(23);\n',{mode:0o700});
 return bin;
}
for(const host of ['codex','claude'])test('launches '+host+' with credential in environment, no token in output or arguments',()=>runCase(dir=>{
 const token='PUBLIC_LOCAL_CASE_TOKEN_'+'q'.repeat(32),file=join(dir,'connection.json');writeFileSync(file,JSON.stringify({connectionToken:token}),{mode:0o600});
 const bin=mockHost(dir,host),r=spawnSync(process.execPath,[launcher,host,file],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}});
 assert.equal(r.status,23);assert.deepEqual(JSON.parse(r.stdout),{tokenPresent:true,args:[]});assert.equal(r.stderr,'');assert.ok(!(r.stdout+r.stderr).includes(token));
}));
test('rejects readable-by-others connection files before starting a host',()=>runCase(dir=>{
 const file=join(dir,'connection.json');writeFileSync(file,JSON.stringify({connectionToken:'x'.repeat(64)}),{mode:0o644});const r=spawnSync(process.execPath,[launcher,'codex',file],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/CREDENTIAL_FILE_PERMISSIONS/);
}));
test('does not echo malformed credential content',()=>runCase(dir=>{
 const secret='DO_NOT_LOG_PUBLIC_TEST_'+ 'z'.repeat(32),file=join(dir,'connection.json');writeFileSync(file,'{invalid:'+secret,{mode:0o600});const r=spawnSync(process.execPath,[launcher,'codex',file],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr.trim(),'CREDENTIAL_FILE_UNAVAILABLE');assert.ok(!r.stderr.includes(secret));
}));
test('does not accept arbitrary host commands or extra arguments',()=>{
 for(const args of [['sh','/not-read'],['codex','/not-read','--arbitrary']]){
  const r=spawnSync(process.execPath,[launcher,...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/USAGE/);
 }
});
