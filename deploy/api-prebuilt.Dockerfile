# Adaptive DTL — backend image from a PREBUILT server/ tree.
#
# CI/air-gap-friendly variant of api.Dockerfile: install deps once
# outside Docker (cd server && npm ci) on a linux-x64 builder, then
# package the whole tree — no npm/network inside the build. Native
# modules ride along (N-API keeps them ABI-stable across Node 20/22
# on the same platform/libc).
#
#   (cd server && npm ci)
#   docker build -f deploy/api-prebuilt.Dockerfile -t adaptive-dtl-api .
#
# The sibling api-prebuilt.Dockerfile.dockerignore re-allows
# server/node_modules (excluded by the root .dockerignore).

FROM node:20-slim
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/ .
RUN test -e node_modules/.bin/tsx && mkdir -p data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/index.ts"]
