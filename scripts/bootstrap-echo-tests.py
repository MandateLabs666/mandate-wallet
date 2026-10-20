"""Restore only pinned EntryPoint sources needed for Echo tests; no bundler/node."""
import hashlib, io, json, tarfile, urllib.request
from pathlib import Path, PurePosixPath

root = Path(__file__).resolve().parents[1]
source = json.loads((root / 'artifacts/m2/upstreams.json').read_text())['account-abstraction']
commit = source['commit']
cache = root / '.runtime/downloads' / f'account-abstraction-{commit}.tar.gz'
cache.parent.mkdir(parents=True, exist_ok=True)
if not cache.exists():
    existing = root / '.runtime/m2/downloads' / cache.name
    if existing.exists(): cache.write_bytes(existing.read_bytes())
    else:
        request = urllib.request.Request(f'https://codeload.github.com/eth-infinitism/account-abstraction/tar.gz/{commit}', headers={'User-Agent': 'Mandate-source-reproduction'})
        cache.write_bytes(urllib.request.urlopen(request, timeout=60).read())
data = cache.read_bytes()
if hashlib.sha256(data).hexdigest() != source['archiveSha256']: raise SystemExit('ENTRYPOINT_ARCHIVE_HASH_MISMATCH')
found = set()
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    for member in archive.getmembers():
        if not member.isfile(): continue
        relative = PurePosixPath(*PurePosixPath(member.name).parts[1:])
        if not relative.parts or '..' in relative.parts: raise SystemExit('UNSAFE_ENTRYPOINT_PATH')
        name = str(relative)
        body = archive.extractfile(member).read()
        if hashlib.sha256(body).hexdigest() != source['files'].get(name): raise SystemExit('ENTRYPOINT_FILE_HASH_MISMATCH')
        target = root / source['directory'] / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != body: raise SystemExit('LOCAL_ENTRYPOINT_MODIFICATION_PRESERVED')
        target.write_bytes(body)
        found.add(name)
if found != set(source['files']): raise SystemExit('ENTRYPOINT_SOURCE_INCOMPLETE')
for name in ['forge-std', 'openzeppelin-contracts']:
    link = root / 'echo/contracts/lib' / name
    expected = (root / 'contracts/lib' / name).resolve()
    if not expected.is_dir(): raise SystemExit('RUN_SDK_BOOTSTRAP_FIRST')
    if link.is_symlink():
        if link.resolve() != expected: raise SystemExit('UNEXPECTED_ECHO_DEPENDENCY_LINK')
    elif link.exists(): raise SystemExit('LOCAL_ECHO_DEPENDENCY_PRESERVED')
    else: link.symlink_to(f'../../../contracts/lib/{name}')
print(json.dumps({'source': 'account-abstraction', 'commit': commit, 'files': len(found), 'archiveAndFilesVerified': True, 'bundlerOrNodeStarted': False}))
