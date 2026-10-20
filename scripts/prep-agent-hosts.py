#!/usr/bin/env python3
"""Inspect CLI version/help only; never load an MCP config or start an Agent."""

import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts/preparation/agent-hosts.json"


def inspect_host(name):
    executable = shutil.which(name)
    if not executable:
        return {"installed": False, "reason": "executable_not_found"}
    observations = []
    outputs = {}
    for args in [("--version",), ("mcp", "add", "--help")]:
        command = [executable, *args]
        try:
            result = subprocess.run(
                command, cwd=ROOT, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, timeout=20, check=False,
            )
        except subprocess.TimeoutExpired:
            observations.append({"args": list(args), "status": "timeout"})
            continue
        outputs[args] = result.stdout
        observations.append({
            "args": list(args), "exitCode": result.returncode,
            "stdoutSHA256": hashlib.sha256(result.stdout.encode()).hexdigest(),
            "stderrPresent": bool(result.stderr.strip()),
            # No stderr contents, environment or user configuration in evidence.
        })
    version = outputs.get(("--version",), "").strip()
    if not re.fullmatch(r"(?:codex-cli \d+\.\d+\.\d+|\d+\.\d+\.\d+ \(Claude Code\))", version):
        version = None
    help_text = outputs.get(("mcp", "add", "--help"), "")
    return {
        "installed": True,
        "executable": executable,
        "resolvedExecutable": str(Path(executable).resolve()),
        "version": version,
        "helpAdvertises": {
            "stdio": "-- <COMMAND>" in help_text if name == "codex" else "stdio" in help_text,
            "http": "--url" in help_text if name == "codex" else "http" in help_text,
            "environmentVariables": "--env" in help_text,
            "explicitScopeOption": "--scope" in help_text,
        },
        "observations": observations,
        "mandateInstalledOrCalledByThisCheck": False,
    }


def main():
    result = {
        "schemaVersion": "preparation.agent-hosts.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "kind": "read_only_cli_capability_inventory",
        "scriptSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "hosts": {name: inspect_host(name) for name in ("codex", "claude")},
        "boundaries": {
            "configurationRead": False, "configurationWritten": False,
            "agentSessionStarted": False, "credentialsRead": False,
            "modelCallMade": False, "transactionOrSignatureMade": False,
            "T6_06Accepted": False,
        },
        "documentation": [
            "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
            "https://code.claude.com/docs/en/mcp",
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(OUTPUT)
    print(json.dumps({name: {
        "version": host.get("version"), "helpAdvertises": host.get("helpAdvertises"),
    } for name, host in result["hosts"].items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
