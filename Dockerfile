# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The server has no npm dependencies (Node's own http and sqlite), so the image needs no node_modules
FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
	PORT=5034 \
	DATABASE_URL=/data/slicefall.db \
	STATIC_DIR=dist \
	ADDRESS_HEADER=x-forwarded-for
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 5034
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
	CMD node -e "fetch('http://localhost:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
