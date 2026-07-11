# Adaptive DTL — frontend image.
#
# Stage 1 builds the Vite bundle; stage 2 serves it with nginx (SPA
# fallback + /api and /ws proxied to the backend service — see
# deploy/nginx.conf). VITE_API_URL is baked at build time: pass
# --build-arg VITE_API_URL=/  (empty = local-first, no backend) or the
# public URL of the API. In docker-compose we use same-origin "/" style
# by leaving it set to the site origin via the nginx proxy, so the
# default below points at the same host.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm can crash mid-install yet exit 0 ("Exit handler never called"),
# leaving a partial tree. Retry once and hard-verify the toolchain
# binaries exist so a bad install fails THIS step, not the build step.
RUN (npm ci --no-audit --no-fund || npm ci --no-audit --no-fund) \
  && test -e node_modules/.bin/vite && test -e node_modules/.bin/tsc
COPY . .
# Same-origin API by default: nginx proxies /api and /ws to the backend.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
