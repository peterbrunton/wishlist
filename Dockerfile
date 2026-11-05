FROM node:24-alpine
RUN apk add --no-cache openssl

EXPOSE 3000
WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Uses the pnpm version pinned in package.json "packageManager"
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY extensions/customer-account-ui-extension/package.json ./extensions/customer-account-ui-extension/

# Dev deps are needed for the build (vite). Scripts are skipped here; Prisma is generated below.
RUN pnpm install --frozen-lockfile --ignore-scripts --prod=false

COPY . .

# Generate the Prisma client + engines for this image's platform at build time,
# so container start only runs migrations (faster cold start, no runtime downloads).
RUN pnpm exec prisma generate && pnpm run build

CMD ["pnpm", "run", "docker-start"]
