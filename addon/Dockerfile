FROM node:20-alpine
WORKDIR /app
COPY server/ /app/server/
COPY server/dist-client/ /app/server/dist-client/
WORKDIR /app/server
RUN npm install --omit=dev && npm cache clean --force
RUN mkdir -p /data
ENV NODE_ENV=production
ENV PORT=3443
ENV JWT_SECRET=change-me-in-production-use-strong-random-value
EXPOSE 3443
CMD ["node", "dist/index.js"]
