# Local-only image of the website. Supabase itself runs via `npx supabase start`.
# Settings are injected at container start from .env.local (see docker-compose.yml),
# so the image contains no keys and does not need rebuilding when they change.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/env-config.sh /docker-entrypoint.d/40-env-config.sh
# Strip Windows line endings and set the exec bit (both can be lost on Windows checkouts).
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-env-config.sh \
 && chmod +x /docker-entrypoint.d/40-env-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
