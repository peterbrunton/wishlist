FROM node:24-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY extensions/customer-account-ui-extension/package.json ./extensions/customer-account-ui-extension/

# Install all deps (including devDeps) so vite is available for the build step
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm run build

CMD ["pnpm", "run", "docker-start"]
