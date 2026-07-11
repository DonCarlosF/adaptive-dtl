# Adaptive DTL — frontend image from a PREBUILT dist/.
#
# CI-friendly variant of web.Dockerfile: build the SPA once outside
# Docker (npm ci && VITE_API_URL=... npm run build), then package the
# result. Identical runtime to web.Dockerfile; no node/npm in the build.
#
#   npm run build   # with VITE_API_URL set for cloud mode
#   docker build -f deploy/web-prebuilt.Dockerfile -t adaptive-dtl-web .
#
# The sibling web-prebuilt.Dockerfile.dockerignore re-allows dist/
# (the root .dockerignore excludes it for the source-building variant).

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
