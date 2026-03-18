FROM node:22-alpine AS client-build

WORKDIR /workspace/client
COPY client/package*.json ./
RUN npm ci

COPY client ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server ./
COPY --from=client-build /workspace/client/dist ./public

RUN chmod +x /app/docker/entrypoint.sh /app/docker/sync-all.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker/entrypoint.sh"]

