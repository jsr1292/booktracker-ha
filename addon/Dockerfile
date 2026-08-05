ARG BUILD_FROM=node:20-alpine

FROM ${BUILD_FROM}

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++

# Copy pre-built client (built on host to avoid cross-platform native binary issues)
RUN mkdir -p /app/server/dist-client/dist
COPY client/dist/ /app/server/dist-client/dist/

# Build the server.
#
# This was "npm install && npm run build && npm ci --omit=dev", which installed
# twice: npm ci wipes node_modules, so better-sqlite3 was compiled from C++ a
# second time. Under emulation that doubled the slowest part of the build.
# Install once, then prune the dev dependencies, which leaves the already-built
# native module in place.
COPY api/ /app/server/
WORKDIR /app/server
RUN npm ci && npm run build && \
    npm prune --omit=dev && npm cache clean --force

# Clean build tools
RUN apk del python3 make g++

# Entrypoint script
COPY addon/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=8099

EXPOSE 3443

CMD ["/app/entrypoint.sh"]
