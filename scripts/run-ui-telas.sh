#!/bin/bash
# Empacota o teste de interface com esbuild (define import.meta.env) e roda no Node.
set -e
cd "$(dirname "$0")/.."
npx esbuild scripts/test-ui-telas.tsx --bundle --platform=node --format=cjs --jsx=automatic \
  --define:import.meta.env='{}' --log-level=warning --outfile=dist/test-ui-telas.cjs
node dist/test-ui-telas.cjs
