#!/bin/sh
# Refresh lib/ from the npm packages pinned in package.json.
#
# The deployed viewer serves these three same-origin: they are all needed before
# the first render, and fetching each from a cross-origin CDN costs a connection
# setup per lib, which is what a reader waits through before the doc appears.
# Mermaid is the exception - 1MB, loaded lazily, and only docs containing a
# diagram request it - so it stays on the CDN (js/viewer.js, MERMAID_CDN).
#
# Run after bumping a version in package.json:
#   npm install && ./sync-libs.sh && npm test
set -eu
cd "$(dirname "$0")"

mkdir -p lib
cp node_modules/marked/marked.min.js                       lib/marked.min.js
cp node_modules/marked-gfm-heading-id/lib/index.umd.js     lib/marked-gfm-heading-id.min.js
cp node_modules/@highlightjs/cdn-assets/highlight.min.js   lib/highlight.min.js

echo "lib/ refreshed from node_modules:"
for f in lib/*.js; do
  printf '  %-32s %7s bytes\n' "$f" "$(wc -c <"$f" | tr -d ' ')"
done
