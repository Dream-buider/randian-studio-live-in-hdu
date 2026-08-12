#!/usr/bin/env bash
set -euo pipefail

health_url=http://127.0.0.1:3212/api/health
body=$(mktemp)
trap 'rm -f "$body"' EXIT

if curl --fail --silent --show-error --max-time 10 "$health_url" > "$body" \
  && node -e '
    const fs = require("node:fs");
    const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (health.status !== "ok") process.exit(1);
  ' "$body"; then
  printf 'LIVE IN HDU health check: ok\n'
  exit 0
fi

echo 'LIVE IN HDU health check failed; restarting service once.' >&2
systemctl restart live-in-hdu
sleep 3
curl --fail --silent --show-error --max-time 10 "$health_url" > "$body"
node -e '
  const fs = require("node:fs");
  const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (health.status !== "ok") process.exit(1);
' "$body"
echo 'LIVE IN HDU health check recovered after restart.'

