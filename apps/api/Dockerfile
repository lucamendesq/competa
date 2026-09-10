# Build from the REPO ROOT: docker build -f apps/api/Dockerfile .
# (needs libs/contracts + the pnpm workspace lockfile, not just apps/api)

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @contabilidade/contracts build
RUN pnpm --filter api build
RUN pnpm deploy --filter=api --prod --legacy /prod/api
# apps/api/dist is gitignored, so `pnpm deploy`'s file copy skips it — bring it back explicitly.
RUN cp -r apps/api/dist /prod/api/dist

FROM node:24-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /prod/api ./
ENV NODE_ENV=production
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
