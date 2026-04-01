FROM node:20-alpine

WORKDIR /app

# Copy client source
COPY client/ /app/client/

# Build the React app
WORKDIR /app/client
RUN npm ci && npm run build

# Place built client where the server expects it
RUN mkdir -p /app/server/dist-client/dist && \
    cp -r /app/client/dist/* /app/server/dist-client/dist/

# Copy server source
COPY api/ /app/server/

# Build the server
WORKDIR /app/server
RUN npm install && npm run build

# Create data directory
RUN mkdir -p /data

# Install production server deps only
RUN npm ci --omit=dev && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3443
ENV JWT_SECRET=change-me-in-production
EXPOSE 3443

CMD ["node", "/app/server/dist/index.js"]
