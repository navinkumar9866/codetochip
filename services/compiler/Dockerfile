# Compile API image. Build from the repo root:
#   docker build -f services/compiler/Dockerfile .
# Toolchain workers get their own images (Phase 0.2), never this one.
FROM node:24-slim
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/boards/package.json packages/boards/
COPY services/compiler/package.json services/compiler/
RUN pnpm install --frozen-lockfile --filter @codetochip/compiler...

COPY packages/boards packages/boards
COPY services/compiler services/compiler

USER node
ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["pnpm", "--filter", "@codetochip/compiler", "start"]
