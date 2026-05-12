#!/usr/bin/env sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Uso: ./infra/scripts/new-client.sh <client-name> <client-slug>"
  exit 1
fi

echo "TODO: provisionar cliente $1 ($2)"