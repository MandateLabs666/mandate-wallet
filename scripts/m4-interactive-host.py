#!/usr/bin/env python3
"""Interactive host approval lab. Uses an already paid service; no new order is needed."""
import argparse,datetime,fcntl,hashlib,json,os,pty,re,selectors,shutil,struct,subprocess,sys,termios,tty
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('host',choices=['codex','claude']);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];role='agent-a' if args.host=='codex' else 'agent-b'
profile=root/'.runtime/m4'/f'{role}.json';config=json.loads(profile.read_text());token=json.loads((root/'.runtime/m4/credentials'/f'{role}.json').read_text())['connectionToken']
os.umask(0o077);directory=Path('/tmp/mandate-host-approval-lab')/args.host;directory.mkdir(parents=True,exist_ok=True)
(directory/'README.txt').write_text('Isolated Mandate MCP approval lab. Only a fixed already-paid test order is used. No owner keys, executable hooks, or unrelated project files are stored here.\n')
node=shutil.which('node');server={'command':node,'args':[str(root/'dist/mandate-mcp.js'),'--config',str(profile)],'cwd':str(root),'env_vars':['MANDATE_CONNECTION_TOKEN'],'startup_timeout_sec':60,'tool_timeout_sec':120,'required':True,'default_tools_approval_mode':'prompt'}
prompt=f'Call only mandate_call_service with serviceId {config["services"][0]["serviceId"]}. It is the existing already-paid owner-approved testnet order. Do not create a new step, sign owner actions, use shell/file tools, or change wallet/session/config. If the host denies the tool, stop and report denial. If allowed, report the existing settlement hash and validated result. No new payment is requested.'
env={k:v for k,v in os.environ.items() if k not in ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN']};env.update({'MANDATE_CONNECTION_TOKEN':token,'TERM':'xterm-256color'})
if args.host=='claude':env.update({'ENABLE_CLAUDEAI_MCP_SERVERS':'false','MCP_CONNECTION_NONBLOCKING':'0'})
if args.host=='codex':
 command=['codex','--no-daemon','--no-alt-screen','-s','read-only','-a','on-request','-C',str(directory)]
 user=Path.home()/'.codex/config.toml'
 if user.exists():
  import tomllib
  for name in tomllib.loads(user.read_text()).get('mcp_servers',{}):command+=['-c',f'mcp_servers.{name}.enabled=false']
 for key,value in server.items():command+=['-c','mcp_servers.mandate.'+key+'='+json.dumps(value)]
 command+=[prompt]
else:
 mcp={'mcpServers':{'mandate':{'type':'stdio','command':node,'args':server['args'],'alwaysLoad':True,'env':{'MANDATE_CONNECTION_TOKEN':'${MANDATE_CONNECTION_TOKEN}'}}}}
 (directory/'.mcp.json').write_text(json.dumps(mcp,indent=2))
 command=['claude','--setting-sources','project','--tools','ToolSearch','--permission-mode','manual','--no-chrome','--ax-screen-reader',prompt]
public=root/'artifacts/m4/hosts';public.mkdir(exist_ok=True);attempt=len(list(public.glob(f'{args.host}-interactive-*.json')))+1;stem=f'{args.host}-interactive-{attempt:02d}'
(public/f'{stem}.json').write_text(json.dumps({'host':args.host,'status':'running','attempt':attempt})+'\n')
if args.host=='claude':
 fresh=directory/f'attempt-{attempt:02d}';fresh.mkdir(exist_ok=True);shutil.copyfile(directory/'README.txt',fresh/'README.txt');shutil.copyfile(directory/'.mcp.json',fresh/'.mcp.json');directory=fresh
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,110,0,0))
child=subprocess.Popen(command,cwd=directory,env=env,stdin=slave,stdout=slave,stderr=slave,close_fds=True);os.close(slave)
(root/'.runtime/m4/hosts'/f'{stem}-active.json').write_text(json.dumps({'pid':child.pid,'driverPid':os.getpid(),'cwd':str(directory),'host':args.host}))
sel=selectors.DefaultSelector();sel.register(master,selectors.EVENT_READ);sel.register(sys.stdin.fileno(),selectors.EVENT_READ);saved=termios.tcgetattr(sys.stdin.fileno());tty.setraw(sys.stdin.fileno())
raw=bytearray();inputs=[];start=datetime.datetime.now(datetime.timezone.utc).isoformat()
try:
 while child.poll() is None:
  for key,_ in sel.select(1):
   if key.fd==master:
    try:data=os.read(master,65536)
    except OSError:break
    if not data:break
    raw.extend(data)
    if b'\x1b[6n' in data:os.write(master,b'\x1b[1;1R')
    sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
   else:
    data=os.read(sys.stdin.fileno(),4096);inputs.append({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bytes':data.hex()});os.write(master,data)
finally:
 termios.tcsetattr(sys.stdin.fileno(),termios.TCSADRAIN,saved)
 if child.poll() is None:child.terminate();child.wait(timeout=20)
 sel.close();os.close(master)
 text=raw.decode('utf8','replace')
 for parent in ['.runtime/keys','.runtime/m3/keys','.runtime/m2/keys','.runtime/m4/credentials']:
  for p in (root/parent).glob('*.json'):
   d=json.loads(p.read_text())
   for field in ['privateKey','connectionToken']:
    if isinstance(d.get(field),str):text=text.replace(d[field],'[REDACTED]');text=text.replace(d[field][2:] if d[field].startswith('0x') else d[field],'[REDACTED]')
 text=re.sub(r'\x1b\].*?(?:\x07|\x1b\\)','',text,flags=re.DOTALL);text=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',text);text=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[EMAIL]',text)
 (public/f'{stem}.txt').write_text(text)
 record={'host':args.host,'attempt':attempt,'mode':'interactive-approval-lab','startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':child.returncode,'alreadyPaidServiceId':config['services'][0]['serviceId'],'profileSHA256':hashlib.sha256(profile.read_bytes()).hexdigest(),'runnerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'inputs':inputs,'transcript':f'artifacts/m4/hosts/{stem}.txt','ownerApproval':'preexisting-chain-grant','additionalPurchaseAuthorized':False}
 (public/f'{stem}.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'host':args.host,'transcript':record['transcript'],'exitCode':child.returncode}),flush=True)
