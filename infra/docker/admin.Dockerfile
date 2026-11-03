# Admin Console (Next.js).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @sqt/admin
COPY apps/admin apps/admin
ARG API_URL
ENV NEXT_PUBLIC_API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sqt/admin build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/admin
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001
CMD ["npx", "next", "start", "-p", "3001"]
