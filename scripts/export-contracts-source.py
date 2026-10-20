#!/usr/bin/env python3
"""Build an allowlisted, reproducible MIT contract source distribution.

No project-root archive, keys, runtime profiles, proposals or registration files.
The original Foundry paths, compiler options and dependency licenses are retained.
"""
from pathlib import Path
import hashlib, io, json, re, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "mandate/web/static"
files = {}
pending = list((ROOT / "mandate/contracts/src").glob("*.sol")) + list((ROOT / "mandate/contracts/test").glob("*.sol"))
prefixes = {"@openzeppelin/contracts/": "contracts/lib/openzeppelin-contracts/contracts/", "forge-std/": "contracts/lib/forge-std/src/", "m1-fixtures/": "contracts/src/"}

def add(path):
    path = path.resolve()
    key = str(path.relative_to(ROOT))
    assert key.startswith(("mandate/contracts/", "contracts/lib/", "contracts/src/MockUSDC.sol")), key
    files[key] = path.read_bytes()
    return key

while pending:
    path = pending.pop().resolve()
    key = str(path.relative_to(ROOT))
    if key in files:
        continue
    add(path)
    for reference in re.findall(r'import\s+(?:[^;]*?\bfrom\s*)?["\']([^"\']+)["\']\s*;', path.read_text(), re.S):
        candidate = next((ROOT / target / reference[len(prefix):] for prefix, target in prefixes.items() if reference.startswith(prefix)), None)
        pending.append(candidate if candidate is not None else path.parent / reference)

add(ROOT / "mandate/contracts/foundry.toml")
files["LICENSE"] = (ROOT / "LICENSE").read_bytes()
for folder in ["contracts/lib/openzeppelin-contracts", "contracts/lib/forge-std"]:
    licenses = list((ROOT / folder).glob("LICENSE*"))
    assert licenses, folder
    for path in licenses:
        add(path)

versions = json.loads((ROOT / "mandate/sdk/VERSIONS.json").read_text())
files["deployments.json"] = (json.dumps({"protocolVersion": 2, "networks": versions["networks"], "mainnetWriteEnabled": False, "sourcePublication": "Source distribution; independent local runtime matching is historical evidence, not an explorer verification badge."}, indent=2) + "\n").encode()
for name in ["MandateAccount", "MandateFactory", "TestUSDC"]:
    artifact = json.loads((ROOT / f"mandate/contracts/out/{name}.sol/{name}.json").read_text())
    files[f"abi/{name}.json"] = (json.dumps(artifact["abi"], indent=2) + "\n").encode()

targets = json.loads((ROOT / "artifacts/m3/verification-inputs/manifest.json").read_text())
for target in targets["targets"]:
    path = ROOT / target["input"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == target["sha256"]
    source = json.loads(path.read_text())
    # Refuse an archive that would pair a changed contract with old deployment inputs.
    matched = 0
    for name in ["MandateAccount", "MandateFactory", "TestUSDC"]:
        for source_name, entry in source["stdJsonInput"]["sources"].items():
            if source_name == f"src/{name}.sol":
                assert entry["content"] == (ROOT / f"mandate/contracts/src/{name}.sol").read_text(), name
                matched += 1
    assert matched > 0, target["input"]
    files[f"verification-inputs/{path.name}"] = path.read_bytes()

files["README.md"] = b"""# Mandate Wallet v2 contracts

MIT-licensed source, tests, exact dependency import closure, ABIs and historical testnet deployment inputs.
Third-party code retains its own license notices under contracts/lib/.

## Reproduce locally

Requirements: Foundry 1.5.1 and Solidity 0.8.26. The original paths and foundry.toml are retained.

```sh
forge build --root mandate/contracts
forge test --root mandate/contracts
```

MandateAccount and MandateFactory are the protocol contracts. TestUSDC and MockUSDC are test-only mintable assets.
No deployment command is run automatically. The package includes no owner/session key, Gateway credential, environment file or private project material.
Mainnet payments are not enabled. Check deployments.json and verification-inputs/ for the historical public testnet identity.
The download is source publication, not an audit, a guarantee of safety, an explorer verification badge or proof of current funding/session availability.

## Core behavior

The owner creates a finite policy and then grants an explicit session. The session registers a payment commitment before an EIP-3009 signature can be accepted by ERC-1271. Paid or unresolved commitments occupy budget. An expired unused nonce can be released; a paid nonce cannot. Replacing or pausing a policy changes its version, making previous grants stale. Revocation is irreversible.
Payment, service delivery and result checks are separate. The contract enforces the financial scope and request/quote hashes, not the entire off-chain session evidence root.
"""
manifest = {"schemaVersion": 1, "protocolVersion": 2, "license": "MIT", "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "compiler": versions["compiler"], "files": {p: hashlib.sha256(data).hexdigest() for p, data in sorted(files.items())}, "scope": "Contracts and their import closure only; test fixtures clearly labeled", "repository": None}
files["SOURCE_MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path, data in sorted(files.items()):
        info = zipfile.ZipInfo("mandate-contracts-v2/" + path, date_time=(2026, 10, 16, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
data = buffer.getvalue()
(OUT / "mandate-contracts-v2.zip").write_bytes(data)
public = {**manifest, "archive": "mandate-contracts-v2.zip", "archiveSHA256": hashlib.sha256(data).hexdigest(), "archiveBytes": len(data), "fileCount": len(files), "localSourceSHA256": {p: hashlib.sha256(data).hexdigest() for p, data in files.items() if (ROOT / p).is_file() and str(p).startswith(("mandate/contracts/", "contracts/lib/", "contracts/src/"))}, "explorerVerificationClaimed": False}
(OUT / "contracts-release.json").write_text(json.dumps(public, indent=2) + "\n")
print(json.dumps({"files": len(files), "bytes": len(data), "sha256": public["archiveSHA256"]}))
