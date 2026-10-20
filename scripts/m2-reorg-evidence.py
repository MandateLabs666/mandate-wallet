"""Summarize the real EntryPoint reorg regression; keep its adapter scope explicit."""
import datetime
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
case = "recovers the same operation after reorg and inclusion in a different transaction"


def report(name):
    data = json.loads((root / "artifacts/m2" / name).read_text())
    matches = [a for s in data["testResults"] for a in s["assertionResults"] if a["title"] == case]
    if len(matches) != 1:
        raise RuntimeError("Missing or ambiguous reorg case: " + name)
    return data, matches[0]


before, negative = report("reorg-recovery-before-fix.json")
after, positive = report("typescript-tests.json")
if (negative["status"] != "failed" or before["numFailedTests"] != 1 or
        not any("expected 'pending' to be 'succeeded'" in s for s in negative["failureMessages"])):
    raise RuntimeError("The negative control did not reproduce stalled recovery")
if (positive["status"] != "passed" or after["success"] is not True or
        after["numPassedTests"] != 19 or after["numFailedTests"] != 0):
    raise RuntimeError("The repaired full regression has not passed")
paths = ["echo/gateway/src/client.ts", "echo/gateway/test/execution.test.ts",
         "artifacts/m2/typescript-tests.json", "artifacts/m2/reorg-recovery-before-fix.json",
         "scripts/m2-reorg-evidence.py"]
result = {
    "schemaVersion": "m2.reorg-recovery.v1",
    "recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "passed": True,
    "chainId": 31337,
    "entryPoint": "fixed official v0.7 artifact, deployed locally",
    "bundlerIsTestAdapter": True,
    "publicGatePassed": False,
    "case": case,
    "beforeClientCommit": "6cf15bf",
    "before": "same operation re-included but client remains pending on old transaction",
    "after": {
        "rpcTimeoutPreservesOriginalTransactionHint": True,
        "confirmedOrphanReceiptClearsCurrentAssetAndGasProof": True,
        "staleBundlerHintRecoveredFromCanonicalEntryPointLogs": True,
        "restartPreservesUserOpHashNonceAndSignature": True,
        "noNewClientSignatureOrSubmission": True,
        "canonicalNonce": "1",
        "canonicalPolicySpend": "100000",
    },
    "sourceSHA256": {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths},
    "limitations": ["Anvil snapshot/revert", "bundler test adapter; separate strict Alto evidence required"],
}
(root / "artifacts/m2/reorg-recovery.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"passed": True, "case": case, "publicGatePassed": False}))
