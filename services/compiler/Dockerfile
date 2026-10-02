# Compile service image: runs the API (ROLE=api) or a worker that launches one sandboxed
# toolchain container per job (ROLE=worker). Build from the repo root:
#   docker build -f services/compiler/Dockerfile .
# User code never runs in this container; it runs in the toolchain worker image.
FROM node:24-slim
RUN corepack enable
# Docker CLI, for ROLE=worker to start sandbox containers via the host's Docker daemon.
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/boards/package.json packages/boards/
COPY packages/data/package.json packages/data/
COPY services/compiler/package.json services/compiler/
RUN pnpm install --frozen-lockfile --filter @codetochip/compiler...

COPY packages/boards packages/boards
COPY packages/data packages/data
COPY services/compiler services/compiler

USER node
ENV HOST=0.0.0.0 PORT=3001 ROLE=api
EXPOSE 3001
CMD ["pnpm", "--filter", "@codetochip/compiler", "start"]
