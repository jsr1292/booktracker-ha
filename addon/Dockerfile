ARG BUILD_FROM=node:20-alpine

FROM ${BUILD_FROM}

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++

# Copy pre-built client (built on host to avoid cross-platform native binary issues)
RUN mkdir -p /app/server/dist-client/dist
COPY client/dist/ /app/server/dist-client/dist/

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
ENV PORT=8099
ENV JWT_SECRET=change-me-in-production

EXPOSE 3443

CMD ["node", "/app/server/dist/index.js"]
