"""Fetch only pinned SDK/contract dependencies, verifying original bytes."""
import hashlib,json,tarfile,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'artifacts/upstreams.json').read_text());cache=root/'.runtime/downloads';cache.mkdir(parents=True,exist_ok=True)
for name in ['x402','forge-std','openzeppelin-contracts']:
    source=manifest[name];archive=cache/(name+'-'+source['commit']+'.tar.gz')
    if not archive.exists():
        url=source['repository'].replace('https://github.com/','https://codeload.github.com/')+'/tar.gz/'+source['commit']
        with urllib.request.urlopen(url,timeout=60) as response:archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=source['archiveSha256']:raise SystemExit('ARCHIVE_HASH_MISMATCH:'+name)
    found=set()
    with tarfile.open(archive) as stream:
        for member in stream:
            if not member.isfile():continue
            relative='/'.join(Path(member.name).parts[1:])
            if relative not in source['files']:continue
            data=stream.extractfile(member).read()
            if hashlib.sha256(data).hexdigest()!=source['files'][relative]:raise SystemExit('SOURCE_HASH_MISMATCH:'+name+'/'+relative)
            target=root/source['directory']/relative;target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists() and target.read_bytes()!=data:raise SystemExit('LOCAL_MODIFICATION_PRESERVED:'+str(target.relative_to(root)))
            target.write_bytes(data);found.add(relative)
    if found!=set(source['files']):raise SystemExit('ARCHIVE_FILE_SET_MISMATCH:'+name)
    print(json.dumps({'source':name,'commit':source['commit'],'verifiedFiles':len(found)}))
