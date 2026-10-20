#!/usr/bin/env python3
"""Export the compiled ABI without maintaining a second hand-written contract interface."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
destination = root / 'mandate/sdk'
destination.mkdir(parents=True, exist_ok=True)
for name, source in [('accountAbi', 'MandateAccount'), ('factoryAbi', 'MandateFactory'), ('testTokenAbi', 'TestUSDC')]:
    artifact = json.loads((root / 'mandate/contracts/out' / (source + '.sol') / (source + '.json')).read_text())
    (destination / (name + '.ts')).write_text('// Generated from fixed Foundry output; regenerate with scripts/m3-export-abi.py.\nexport const ' + name + ' = ' + json.dumps(artifact['abi'], indent=2) + ' as const;\n')
print(json.dumps({'exported': 3}))
