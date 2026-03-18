#!/bin/sh
set -eu

PORT_VALUE="${PORT:-3000}"

echo "Triggering /sync/all on port ${PORT_VALUE}"
curl --fail --show-error --silent "http://localhost:${PORT_VALUE}/sync/all"

