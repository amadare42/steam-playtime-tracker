#!/bin/sh
set -eu

echo "Running DB migrations..."
npm run db:migrate

echo "Starting server..."
exec npm run start:prod

