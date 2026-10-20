#!/usr/bin/env python3
import hashlib, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'artifacts/upstreams.json').read_text())
failures = []
for name, source in manifest.items():
    for path, expected in source['files'].items():
        p = root / source['directory'] / path
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != expected:
            failures.append(f'{name}/{path}')
print(json.dumps({'verifiedFiles': sum(len(s['files']) for s in manifest.values()), 'mismatches': failures}))
sys.exit(bool(failures))
