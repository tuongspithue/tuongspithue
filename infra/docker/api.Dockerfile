# Backend API (NestJS). Build từ thư mục gốc repo: docker build -f infra/docker/api.Dockerfile .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter @sqt/api... --filter @sqt/domain
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter @sqt/domain build && pnpm --filter @sqt/api build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Áp dụng migration rồi chạy API.
CMD ["sh", "-c", "node dist/src/database/migrate.js && node dist/src/main.js"]
