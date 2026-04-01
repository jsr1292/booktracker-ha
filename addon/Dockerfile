FROM ghcr.io/home-assistant/aarch64-hassio-addon-base:debian

# Install Node.js and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential git curl \
    && rm -rf /var/lib/apt/lists/*

# Set Node.js environment
ENV NODE_VERSION=20

# Copy client and build
COPY client/ /app/client/
WORKDIR /app/client
RUN npm ci && npm run build

# Copy built client to server static path
RUN mkdir -p /app/server/dist-client/dist && \
    cp -r /app/client/dist/* /app/server/dist-client/dist/

# Copy and build server
COPY api/ /app/server/
WORKDIR /app/server
RUN npm install && npm run build

# Production deps only
RUN npm ci --omit=dev && npm cache clean --force

# Data dir
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3443
ENV JWT_SECRET=change-me-in-production

EXPOSE 3443

CMD ["node", "/app/server/dist/index.js"]
