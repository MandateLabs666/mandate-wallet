"""Run pinned TLSNotary binaries in bounded project-only containers."""
import datetime,hashlib,json,subprocess,time,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1];source=root/'.runtime/m5/tlsnotary/tlsn-0.1.0-alpha.15';public=root/'artifacts/m5/https';public.mkdir(parents=True,exist_ok=True)
image='rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1';records=[]
def run(name,binary,extra_env=None):
    command=['docker','run','--rm','--name','mandate-m5-tlsn-'+name,'--cpus=2','--memory=4g','--pids-limit=256','--mount','type=bind,src='+str(source)+',dst=/work','--workdir','/work']
    for key,value in (extra_env or {}).items():command+=['--env',key+'='+value]
    command+=[image,'/work/target/release/examples/'+binary]
    started=time.monotonic();result=subprocess.run(command,capture_output=True,text=True,timeout=120)
    output=result.stdout+result.stderr;(public/(name+'.txt')).write_text(output)
    record={'name':name,'binary':binary,'exitCode':result.returncode,'elapsedSeconds':round(time.monotonic()-started,3),'outputSHA256':hashlib.sha256(output.encode()).hexdigest()};records.append(record);print(json.dumps(record),flush=True);return result
if run('prove','mandate_prove').returncode:raise SystemExit('TLSNOTARY_PROVE_FAILED')
if run('present','mandate_present').returncode:raise SystemExit('TLSNOTARY_PRESENT_FAILED')
if run('verify','mandate_verify').returncode:raise SystemExit('TLSNOTARY_VERIFY_FAILED')
presentation=source/'example-json.presentation.tlsn'
original=presentation.read_bytes();(source/'original-presentation.tlsn').write_bytes(original)
# Same proof with a different expected domain must not be accepted.
wrong=run('wrong-server','mandate_verify',{'MANDATE_EXPECTED_SERVER':'example.org'})
if wrong.returncode==0:raise SystemExit('WRONG_SERVER_ACCEPTED')
position=original.find(b'"resources"')
if position<0:position=original.find(b'rate')
if position<0:raise SystemExit('DISCLOSED_RESPONSE_BYTES_NOT_LOCATED')
altered=bytearray(original);altered[position]^=1;presentation.write_bytes(altered)
try:bad=run('tampered-response','mandate_verify')
finally:presentation.write_bytes(original)
if bad.returncode==0:raise SystemExit('TAMPERED_RESPONSE_ACCEPTED')
key=source/'mandate-notary.pub';original_key=key.read_bytes();changed=bytearray(original_key);changed[-1]^=1;key.write_bytes(changed)
try:bad_key=run('wrong-notary-key','mandate_verify')
finally:key.write_bytes(original_key)
if bad_key.returncode==0:raise SystemExit('WRONG_NOTARY_KEY_ACCEPTED')
shutil.copyfile(presentation,public/'public.presentation.tlsn');shutil.copyfile(key,public/'notary.pub')
metadata=json.loads((source.parent/'source.json').read_text())
report={'schemaVersion':2,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':metadata,'image':image,'imageDigest':'sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1','endpoint':'https://api.github.com/rate_limit','authentication':'none','proofType':'TLSNotary MPC-TLS attestation/presentation','presentationSHA256':hashlib.sha256(original).hexdigest(),'presentationBytes':len(original),'notaryKeySHA256':hashlib.sha256(original_key).hexdigest(),'cases':records,'generationAndIndependentFileVerificationPassed':True,'limits':['Prover and notary ran on the same host as separate logical roles; this does not provide deployment independence against the full host.','The independent verifier pins a separate public-key file, not the key embedded in the presentation.','This public HTTPS study is separate from the loopback paid merchant and does not upgrade its HTTPS provenance.'],'firstVersionDecision':'Keep optional reproducible research example; do not make MPC-TLS a mandatory payment path until an independently managed notary is configured.'}
(public/'tlsnotary-evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'proofVerified':True,'presentationBytes':len(original),'tamperedCasesRejected':3}),flush=True)
