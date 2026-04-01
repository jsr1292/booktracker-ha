ARG BUILD_FROM=node:20-alpine

FROM ${BUILD_FROM}

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++

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

# Clean build tools
RUN apk del python3 make g++

# Data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3443
ENV JWT_SECRET=change-me-in-production

EXPOSE 3443

CMD ["node", "/app/server/dist/index.js"]
