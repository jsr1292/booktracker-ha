#!/bin/sh
# Generate JWT secret at runtime if not provided
: "${JWT_SECRET:=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")}"
export JWT_SECRET

# Read from HA addon options (written to /data/options.json by HA)
if [ -f /data/options.json ]; then
  REGISTRATION_ENABLED=$(node -e "const o=require('/data/options.json'); console.log(o.registration_enabled||false)")
  ADMIN_KEY=$(node -e "const o=require('/data/options.json'); console.log(o.admin_key||'')")
fi

: "${REGISTRATION_ENABLED:=false}"
: "${ADMIN_KEY:=}"
export REGISTRATION_ENABLED
export ADMIN_KEY

exec node /app/server/dist/index.js
