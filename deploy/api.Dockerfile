# Adaptive DTL — backend image (Express + JWT + Anthropic proxy + WS relay).
#
# node:20-slim (glibc) rather than alpine so native modules (e.g. the
# SQLite driver) use prebuilt binaries without a toolchain layer.
# Runs via tsx to match `npm start`; the server refuses to boot without
# JWT_SECRET, which compose supplies.

FROM node:20-slim
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
# --include=dev is required: NODE_ENV=production makes npm omit
# devDependencies by default, but the server runs TypeScript directly
# via tsx, which lives in devDependencies alongside typescript.
RUN npm ci --include=dev --no-audit --no-fund \
  && test -e node_modules/.bin/tsx
COPY server/ .
# Data lives on a volume; both the JSON store and the SQLite backend
# write under /app/server/data.
RUN mkdir -p data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/index.ts"]
