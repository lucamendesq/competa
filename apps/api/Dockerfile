FROM node:22.22.3-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @contabilidade/contracts build
RUN pnpm --filter api build
RUN pnpm deploy --filter=api --prod --legacy /prod/api
RUN cp -r apps/api/dist /prod/api/dist
# apps/api/tsconfig.json extends the workspace root's tsconfig.base.json, which `pnpm deploy`
# doesn't copy (it's outside the package). drizzle-kit/tsx need it at runtime to load
# drizzle.config.ts and the seed scripts.
RUN cp tsconfig.base.json /prod/tsconfig.base.json

FROM node:22.22.3-alpine
RUN apk add --no-cache tini
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /prod/api ./
COPY --from=build --chown=app:app /prod/tsconfig.base.json /tsconfig.base.json
ENV NODE_ENV=production
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
