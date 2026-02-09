# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for environment variables
ARG NEXT_PUBLIC_PARSE_APP_ID
ARG NEXT_PUBLIC_PARSE_JS_KEY
ARG NEXT_PUBLIC_PARSE_SERVER_URL

ENV NEXT_PUBLIC_PARSE_APP_ID=$NEXT_PUBLIC_PARSE_APP_ID
ENV NEXT_PUBLIC_PARSE_JS_KEY=$NEXT_PUBLIC_PARSE_JS_KEY
ENV NEXT_PUBLIC_PARSE_SERVER_URL=$NEXT_PUBLIC_PARSE_SERVER_URL

RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy data files for scanner
COPY --from=builder /app/src/data ./src/data

# Copy parse module and its dependencies for seed-db.js script
COPY --from=builder /app/node_modules/parse ./node_modules/parse
COPY --from=builder /app/node_modules/@babel/runtime-corejs3 ./node_modules/@babel/runtime-corejs3
COPY --from=builder /app/node_modules/core-js-pure ./node_modules/core-js-pure
COPY --from=builder /app/node_modules/crypto-js ./node_modules/crypto-js
COPY --from=builder /app/node_modules/idb-keyval ./node_modules/idb-keyval
COPY --from=builder /app/node_modules/ws ./node_modules/ws

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy scripts
COPY --from=builder /app/scripts ./scripts

CMD ["sh", "-c", "node scripts/seed-db.js && node server.js"]
