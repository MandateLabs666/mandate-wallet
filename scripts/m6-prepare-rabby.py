"""Download a pinned official Rabby extension into ignored test runtime only."""
import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
runtime = root / '.runtime/rabby-wallet'
runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
tag = 'v0.94.12'
archive_hash = 'e1132d749d4f34d3c7a870dfcfc07ecfef1b6030a1c386c28747e8e16417aa39'
release_url = f'https://api.github.com/repos/RabbyHub/Rabby/releases/tags/{tag}'
release = json.load(urllib.request.urlopen(release_url, timeout=30))
asset = next(a for a in release['assets'] if a['name'] == 'Rabby_v0.94.12.zip')
assert asset['digest'] == 'sha256:' + archive_hash
archive = runtime / asset['name']
if not archive.exists():
    archive.write_bytes(urllib.request.urlopen(asset['browser_download_url'], timeout=45).read())
assert hashlib.sha256(archive.read_bytes()).hexdigest() == archive_hash
extension = runtime / 'extension-0.94.12'
with zipfile.ZipFile(archive) as package:
    files = [p for p in package.namelist() if not p.endswith('/')]
    assert len(files) == 1153
    assert all(not p.startswith('/') and '..' not in Path(p).parts for p in files)
    if not extension.exists():
        package.extractall(extension)
    assert set(files) == {str(p.relative_to(extension)) for p in extension.rglob('*') if p.is_file()}
    assert all((extension / p).read_bytes() == package.read(p) for p in files)
manifest = json.loads((extension / 'manifest.json').read_text())
assert manifest['version'] == '0.94.12' and manifest['manifest_version'] == 3
source_path = 'src/ui/views/Approval/components/Connect/ConnectContent.tsx'
source_url = f'https://raw.githubusercontent.com/RabbyHub/Rabby/{tag}/{source_path}'
scope_source = runtime / 'connection-scope.tsx.source.txt'
if not scope_source.exists():
    scope_source.write_bytes(urllib.request.urlopen(source_url, timeout=30).read())
scope_hash = '1853a1d3419988818c4583dba6fd83414ab86989b4e286626dd13bfc51c8e7b4'
assert hashlib.sha256(scope_source.read_bytes()).hexdigest() == scope_hash
# Preserve the path consumed by the exact native driver already exercised locally.
scope_cache = runtime / 'official-source'
scope_cache.mkdir(exist_ok=True)
driver_scope = scope_cache / source_path.replace('/', '__')
if driver_scope.exists():
    assert driver_scope.read_bytes() == scope_source.read_bytes()
else:
    driver_scope.write_bytes(scope_source.read_bytes())
result = {'tag': tag, 'release': release['html_url'], 'publishedAt': release['published_at'],
          'url': asset['browser_download_url'], 'archiveSHA256': archive_hash,
          'extensionVersion': manifest['version'], 'files': len(files), 'archiveExactMatch': True,
          'connectionScopeSource': source_url, 'connectionScopeSHA256': scope_hash,
          'installedInPersonalBrowser': False}
(runtime / 'prepared.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
