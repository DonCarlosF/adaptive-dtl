# Adaptive DTL — backend image from a PREBUILT server/ tree.
#
# CI/air-gap-friendly variant of api.Dockerfile: install deps once
# outside Docker (cd server && npm ci) on a linux-x64 builder, then
# package the whole tree — no npm/network inside the build.
#
# IMPORTANT: the builder must match this base image: same Node MAJOR and
# a glibc no newer than the image (trixie = glibc 2.41).
# better-sqlite3 ships ABI-pinned binaries (not N-API), so a tree
# installed under Node 22 only loads on Node 22.
#
#   (cd server && npm ci)          # on Node 22.x, linux-x64/glibc
#   docker build -f deploy/api-prebuilt.Dockerfile -t adaptive-dtl-api .
#
# The sibling api-prebuilt.Dockerfile.dockerignore re-allows
# server/node_modules (excluded by the root .dockerignore).

FROM node:22-trixie-slim
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/ .
RUN test -e node_modules/.bin/tsx && mkdir -p data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/index.ts"]
