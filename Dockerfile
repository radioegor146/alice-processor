FROM node:24
COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml
RUN corepack enable && pnpm install
COPY . .
CMD ["pnpm", "start"]