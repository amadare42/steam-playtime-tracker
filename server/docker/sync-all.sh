#!/bin/sh
set -eu

PORT_VALUE="${PORT:-3000}"
TIMEOUT_SECONDS="${SYNC_ALL_TIMEOUT_SECONDS:-120}"
NOW_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "[${NOW_UTC}] Triggering /sync/all on port ${PORT_VALUE} (timeout=${TIMEOUT_SECONDS}s)"
if curl --fail --show-error --silent --max-time "${TIMEOUT_SECONDS}" "http://localhost:${PORT_VALUE}/sync/all"; then
  echo "[${NOW_UTC}] /sync/all completed successfully"
else
  EXIT_CODE=$?
  echo "[${NOW_UTC}] /sync/all failed with exit code ${EXIT_CODE}" >&2
  exit "${EXIT_CODE}"
fi

