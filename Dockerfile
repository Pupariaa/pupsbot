FROM node:22-bookworm-slim AS base
ENV TZ=Europe/Paris
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
COPY pnpm-lock.yaml ./
COPY yarn.lock ./
RUN bash -lc 'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --prod; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile --production=true; elif [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi'

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ pkg-config libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev fontconfig && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
COPY pnpm-lock.yaml ./
COPY yarn.lock ./
RUN bash -lc 'if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; elif [ -f package-lock.json ]; then npm ci; else npm install; fi'
COPY . .
RUN bash -lc 'node -e "p=require(\"./package.json\");process.exit(p.scripts&&p.scripts.build?0:1)" && (command -v pnpm >/dev/null && pnpm build || command -v yarn >/dev/null && yarn build || npm run build) || true'

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init libcairo2 libjpeg62-turbo libpango-1.0-0 libgif7 librsvg2-2 fontconfig && rm -rf /var/lib/apt/lists/*
RUN fc-cache -f -v
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/index.js /app/index.js
COPY --from=build /app/package.json /app/package.json
USER node
EXPOSE 25586
EXPOSE 25587
ENTRYPOINT ["dumb-init","--"]
CMD ["node","--max-old-space-size=8192","index.js"]
