#!/bin/sh
set -eu

pnpm --filter api run tenant:create "$@"
