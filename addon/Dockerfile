ARG BUILD_FROM

FROM ${BUILD_FROM}

WORKDIR /app

# Install Node.js
RUN \
  apt_key_adv --keyserver keyserver.ubuntu.com --recv-keys 4D3EC19D && \
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
  apt-get update && \
  apt-get install -y --no-install-recommends nodejs && \
  rm -rf /var/lib/apt/lists/*

# Build the React client
COPY client/ /app/client/
WORKDIR /app/client
RUN npm ci && npm run build

# Copy built client to server static path
RUN mkdir -p /app/server/dist-client/dist && \
    cp -r /app/client/dist/* /app/server/dist-client/dist/

# Build the server
COPY api/ /app/server/
WORKDIR /app/server
RUN npm install && npm run build && \
    npm ci --omit=dev && npm cache clean --force

# Data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3443
ENV JWT_SECRET=change-me-in-production

EXPOSE 3443

CMD ["node", "/app/server/dist/index.js"]
