#!/bin/sh
# Generate JWT secret at runtime if not provided
: "${JWT_SECRET:=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")}"
export JWT_SECRET
exec node /app/server/dist/index.js
