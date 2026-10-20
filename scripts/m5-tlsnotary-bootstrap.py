"""Prepare pinned upstream TLSNotary examples; keep keys and transcripts private."""
import hashlib,json,os,secrets,shutil,tarfile,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
metadata=json.loads((root/'research/tlsnotary-alpha15/source.json').read_text())
directory=root/'.runtime/m5/tlsnotary';directory.mkdir(parents=True,exist_ok=True,mode=0o700)
archive=directory/'tlsn-alpha15.tar.gz';source=root/metadata['sourceDirectory']
if not source.exists():
    if not archive.exists():
        with urllib.request.urlopen(metadata['url'],timeout=60) as response:archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=metadata['archiveSHA256']:raise SystemExit('UPSTREAM_ARCHIVE_HASH_MISMATCH')
    with tarfile.open(archive) as stream:stream.extractall(directory,filter='data')
if hashlib.sha256((source/'Cargo.lock').read_bytes()).hexdigest()!=metadata['cargoLockSHA256']:raise SystemExit('CARGO_LOCK_HASH_MISMATCH')
for name,expected in metadata['adaptations'].items():
    path=root/'research/tlsnotary-alpha15'/name
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise SystemExit('ADAPTATION_HASH_MISMATCH:'+name)
    target=source/'crates/examples'/('basic' if name=='mandate_public.rs' else 'attestation')/name
    shutil.copyfile(path,target)
manifest=source/'crates/examples/Cargo.toml';text=manifest.read_text()
for name in metadata['adaptations']:
    binary=name.removesuffix('.rs')
    if 'name = "'+binary+'"' not in text:text+='\n[[example]]\nname = "'+binary+'"\npath = "'+('basic' if binary=='mandate_public' else 'attestation')+'/'+name+'"\n'
manifest.write_text(text)
key=source/'mandate-notary.key'
if not key.exists():
    # Rejection sampling ensures a valid secp256k1 scalar without a wallet key.
    order=int('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',16)
    while True:
        value=secrets.token_bytes(32)
        if 0<int.from_bytes(value,'big')<order:break
    fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(value)
os.chmod(key,0o600)
(directory/'source.json').write_text(json.dumps({k:metadata[k] for k in ['tag','url','archiveSHA256','sourceDirectory']},indent=2)+'\n')
print(json.dumps({'source':metadata['sourceDirectory'],'lockVerified':True,'adaptationsVerified':True,'key':'private; preserved on retry'}))
