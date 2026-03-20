#!/bin/sh
set -eu

is_truthy() {
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  [ "$value" = "1" ] || [ "$value" = "true" ] || [ "$value" = "yes" ] || [ "$value" = "on" ]
}

configure_sync_cron() {
  if ! is_truthy "${SYNC_ALL_ENABLED:-false}"; then
	echo "SYNC_ALL_ENABLED is false; skipping cron setup."
	return
  fi

  timezone="${SYNC_ALL_TIMEZONE:-UTC}"
  if [ -f "/usr/share/zoneinfo/${timezone}" ]; then
	ln -snf "/usr/share/zoneinfo/${timezone}" /etc/localtime
	echo "${timezone}" > /etc/timezone
	export TZ="${timezone}"
  else
	echo "Timezone ${timezone} not found; falling back to UTC."
	export TZ="UTC"
  fi

  cron_expr="${SYNC_ALL_CRON:-0 * * * *}"
  timeout_seconds="${SYNC_ALL_TIMEOUT_SECONDS:-120}"
  port_value="${PORT:-3000}"

  cat > /etc/crontabs/root <<EOF
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PORT=${port_value}
SYNC_ALL_TIMEOUT_SECONDS=${timeout_seconds}
TZ=${TZ}
${cron_expr} /app/docker/sync-all.sh >> /proc/1/fd/1 2>> /proc/1/fd/2
EOF

  echo "Starting cron with schedule: ${cron_expr} (TZ=${TZ})"
  crond
}

echo "Running DB migrations..."
npm run db:migrate

configure_sync_cron

echo "Starting server..."
exec npm run start:prod

