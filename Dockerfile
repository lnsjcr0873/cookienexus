# Multi-stage build for CookieNexus Central Hub
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and package manifests
COPY package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/sdk-ts/package.json ./packages/sdk-ts/

RUN npm install

# Copy source code and build
COPY packages/server ./packages/server
COPY packages/sdk-ts ./packages/sdk-ts

RUN npm --workspace=@cookienexus/server run build
RUN npm --workspace=@cookienexus/sdk-ts run build

# Production image
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8765
ENV HOST=0.0.0.0

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/

EXPOSE 8765

CMD ["node", "packages/server/dist/index.js"]
