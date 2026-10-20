#!/usr/bin/env python3
import json,os,pathlib,secrets,subprocess,sys,urllib.request,datetime,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
PRIMARY='https://checkpoint-sync.sepolia.ethpandaops.io'
SECONDARY='https://beaconstate-sepolia.chainsafe.io'
def fetch(url):return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mandate-M2'}),timeout=30))
phase=sys.argv[1] if len(sys.argv)>1 else 'status'
def write(name,obj):(ROOT/'artifacts/m2'/name).write_text(json.dumps(obj,indent=2)+'\n')
if phase=='prepare':
 (ROOT/'.runtime/m2').mkdir(parents=True,exist_ok=True)
 (ROOT/'.runtime/m2/infra.env').write_text(f'M2_UID={os.getuid()}\nM2_GID={os.getgid()}\n')
 print(json.dumps({'route':'third-party-rpc','primary':'https://sepolia.drpc.org','witness':'https://ethereum-sepolia-rpc.publicnode.com','publicServices':['alto']}))
elif phase in ['local-up','local-bundler','local-stop']:
 env=ROOT/'.runtime/m2/local-infra.env';env.parent.mkdir(parents=True,exist_ok=True);env.write_text(f'M2_UID={os.getuid()}\nM2_GID={os.getgid()}\n')
 actions=['up','-d','geth'] if phase=='local-up' else ['--profile','bundler','up','-d','alto'] if phase=='local-bundler' else ['stop','geth','alto']
 subprocess.run(['docker-compose','--env-file',str(env),'-f',str(ROOT/'echo/infra/local-geth.yaml'),'-p','mandate-m2-local',*actions],check=True)
elif phase=='bundler':
 probe=subprocess.run(['pnpm','exec','tsx','echo/experiments/readiness.ts'],cwd=ROOT,capture_output=True,text=True,check=True)
 config=json.loads((ROOT/'.runtime/m2/alto-config.json').read_text())
 if config.get('safe-mode') is not True or config.get('dangerous-skip-user-operation-validation') is not False or config.get('entrypoints','').lower()!='0x0000000071727de22e5e9d8baf0edac6f37da032':raise RuntimeError('Strict canonical config required')
 image=subprocess.check_output(['docker','image','inspect','mandate-m2-alto:ed03b9c','--format','{{.Id}}'],text=True).strip()
 if image!=json.loads((ROOT/'artifacts/m2/alto-build.json').read_text())['imageId']:raise RuntimeError('Bundler image does not match verified build')
 if config.get('rpc-url')!='https://sepolia.drpc.org':raise RuntimeError('Use the approved remote tracing RPC')
 ready=json.loads(probe.stdout.strip())
 if not ready.get('ready') or ready.get('route')!='third-party-rpc' or not ready.get('finalizedAnchorMatches'):raise RuntimeError('Remote RPC readiness gate missing')
 subprocess.run(['docker-compose','--env-file',str(ROOT/'.runtime/m2/infra.env'),'-f',str(ROOT/'echo/infra/compose.yaml'),'-p','mandate-m2','--profile','bundler','up','-d','alto'],check=True)
 for attempt in range(30):
  try:
   request=urllib.request.Request('http://127.0.0.1:24337',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'eth_supportedEntryPoints','params':[]}).encode(),headers={'Content-Type':'application/json'})
   response=json.load(urllib.request.urlopen(request,timeout=5))
   if response.get('result') and [a.lower() for a in response['result']]==[config['entrypoints'].lower()]:
    write('bundler-readiness.json',{'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ready':True,'entryPoints':response['result'],'imageId':image,'safeMode':True,'skipValidation':False})
    break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Strict Alto HTTP startup readiness failed')
elif phase in ['up','down']:
 if phase=='up':raise RuntimeError('Public self-node sync disabled by user decision; use remote readiness and bundler commands')
 subprocess.run(['docker-compose','--env-file',str(ROOT/'.runtime/m2/infra.env'),'-f',str(ROOT/'echo/infra/compose.yaml'),'-p','mandate-m2','--profile','bundler','stop','alto'],check=True)
elif phase=='status':
 print((ROOT/'artifacts/m2/node-readiness.json').read_text())
else:raise RuntimeError('Unknown phase')
