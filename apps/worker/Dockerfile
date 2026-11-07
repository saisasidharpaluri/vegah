FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/worker apps/worker
RUN npm run build --workspace=@vegah/worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@vegah/worker --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
