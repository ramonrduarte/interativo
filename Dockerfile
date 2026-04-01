# ─── Stage 1: build dashboard + TV frontend ───────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files for all workspaces (layer cache)
COPY package*.json ./
COPY server/package*.json ./server/
COPY dashboard/package*.json ./dashboard/
COPY tv/package*.json ./tv/

RUN npm ci

# Copy source and build (outputs to server/public/dashboard + server/public/tv)
COPY . .
RUN npm run build

# ─── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy server source + built frontend assets
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/server/public ./server/public

# Copy only production node_modules (workspaces hoist to root)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server/package.json ./server/

# Data and uploads are mounted as volumes at runtime
RUN mkdir -p /app/data /app/uploads/images /app/uploads/videos

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "server/src/index.js"]
