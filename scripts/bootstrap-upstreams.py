#!/usr/bin/env python3
"""Import public, pinned upstreams without Git submodules or executable setup hooks."""
import hashlib
import json
import pathlib
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    "echo-contracts": ("MartX-Web3/echo-contracts", "bf68bec76cb4b1394271e0d6043e6d2221d71334"),
    "echo-gateway": ("MartX-Web3/echo-gateway", "21fddd41c53dc08a4b325d0bd526fbfbabdf9f22"),
    "x402": ("x402-foundation/x402", "6c470a80c6145b27fcbb4f6359c47a6a8cfe5887"),
    "forge-std": ("foundry-rs/forge-std", "0844d7e1fc5e60d77b68e469bff60265f236c398"),
    "openzeppelin-contracts": ("OpenZeppelin/openzeppelin-contracts", "5fd1781b1454fd1ef8e722282f86f9293cacf256"),
}

def selected(name, path):
    if name != "x402":
        return True
    return path in ("LICENSE", "README.md") or path.startswith((
        "specs/", "docs/advanced-concepts/wallet-compatibility", "typescript/scripts/",
        "typescript/packages/core/", "typescript/packages/mechanisms/evm/",
    )) or (path.startswith("typescript/") and path.count("/") == 1 and not path.endswith("package.json"))

def main():
    cache = ROOT / ".runtime/downloads"
    cache.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, (repo, commit) in SOURCES.items():
        archive = cache / f"{name}-{commit}.tar.gz"
        if not archive.exists():
            urllib.request.urlretrieve(f"https://codeload.github.com/{repo}/tar.gz/{commit}", archive)
        target = ROOT / ("contracts/lib/" + name if name in ("forge-std", "openzeppelin-contracts") else "vendor/" + name)
        hashes = {}
        with tarfile.open(archive) as tar:
            prefix = tar.getmembers()[0].name.split("/")[0] + "/"
            for member in tar.getmembers():
                if not member.isfile() or not member.name.startswith(prefix):
                    continue
                relative = member.name[len(prefix):]
                if not relative or ".." in pathlib.PurePosixPath(relative).parts or not selected(name, relative):
                    continue
                data = tar.extractfile(member).read()
                output = target / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                if output.exists() and output.read_bytes() != data:
                    raise RuntimeError(f"Refusing to overwrite modified upstream file: {output}")
                output.write_bytes(data)
                hashes[relative] = hashlib.sha256(data).hexdigest()
        manifest[name] = {"repository": f"https://github.com/{repo}", "commit": commit,
                          "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                          "directory": str(target.relative_to(ROOT)), "files": hashes}
        print(json.dumps({"source": name, "commit": commit, "files": len(hashes)}))
    dest = ROOT / "artifacts/upstreams.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(manifest, indent=2) + "\n")

if __name__ == "__main__":
    main()
