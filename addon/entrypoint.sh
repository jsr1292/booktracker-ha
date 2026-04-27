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

# Create users from config (runs in background, waits for API to start)
if [ -f /data/options.json ]; then
  node -e "
    const http = require('http');
    const options = require('/data/options.json');
    const users = options.users || [];
    if (!users.length) process.exit(0);
    const adminKey = options.admin_key || '';

    function tryCreate(i) {
      if (i >= users.length) { console.log('All config users processed'); process.exit(0); }
      const u = users[i];
      if (!u.username || !u.password) { tryCreate(i+1); return; }
      const data = JSON.stringify({ adminKey: adminKey, username: u.username, password: u.password });
      const req = http.request({
        hostname: '127.0.0.1', port: 8099,
        path: '/api/admin/create-user', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode === 201) console.log('Created user: ' + u.username);
          else if (res.statusCode === 409) console.log('User exists: ' + u.username);
          else console.log('User ' + u.username + ': ' + res.statusCode + ' ' + body);
          tryCreate(i+1);
        });
      });
      req.on('error', () => { setTimeout(() => tryCreate(i), 1500); });
      req.write(data);
      req.end();
    }
    // Give API time to start
    setTimeout(() => tryCreate(0), 2000);
  " &
fi

exec node /app/server/dist/index.js
