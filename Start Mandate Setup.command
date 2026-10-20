#!/bin/zsh
# Source checkout launcher. It never installs host configuration on startup.
set -e
cd "${0:A:h}"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a!==24||b<2){console.error("Mandate requires Node 24.2–24.x. Install it from https://nodejs.org/");process.exit(1)}'
if [[ ! -d node_modules ]]; then
  print "Please complete the source installation described in mandate/sdk/QUICKSTART.zh-CN.md first."
  exit 1
fi
node scripts/build-desktop-extension.mjs
MANDATE_BUILD_REPORT_DIR=.runtime/mandate-setup/build node scripts/m6-build-web.mjs
exec node --import tsx mandate/onboarding/cli.ts --open
