# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:20.20.2-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28.3-alpine

FROM ${NODE_IMAGE} AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM backend-deps AS backend-build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM backend-deps AS backend-dev
COPY backend/tsconfig.json ./
COPY backend/src ./src
EXPOSE 23233
CMD ["npm", "run", "dev"]

FROM ${NODE_IMAGE} AS backend-runtime
ENV NODE_ENV=production \
    PORT=23233 \
    TOROLLO_HOST=0.0.0.0
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=backend-build /app/backend/dist ./dist
COPY roadmaps /app/roadmaps
EXPOSE 23233
CMD ["node", "dist/server.js"]

FROM ${NODE_IMAGE} AS frontend-deps
WORKDIR /app
COPY package.json ./package.json
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM frontend-deps AS frontend-build
COPY frontend ./
RUN npm run build

FROM frontend-deps AS frontend-dev
COPY frontend ./
EXPOSE 23232
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "23232"]

FROM ${NGINX_IMAGE} AS frontend-runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY docker/frontend-env.js /usr/share/nginx/html/env.js
EXPOSE 23232
CMD ["nginx", "-g", "daemon off;"]
