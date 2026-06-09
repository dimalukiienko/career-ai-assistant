# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# ---- Runtime stage ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Cloud Run injects PORT; the app reads it.
EXPOSE 8080
CMD ["node", "dist/index.js"]
