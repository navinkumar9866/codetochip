# Compile service for Cloud Run (ADR 0005): the toolchain worker image plus Node and the API.
# Each instance serves one compile at a time and runs it inside itself (SANDBOX_ISOLATION=instance):
# Cloud Run's gVisor sandbox is the job's sandbox, the work folder is emptied before and after
# every job, and the service has no internet route (deploy/cloud-run/README.md).
# Built by deploy/cloud-run/cloudbuild.yaml, which builds WORKER_IMAGE first.
ARG WORKER_IMAGE=codetochip/worker-arduino

FROM node:24-slim AS app
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/boards/package.json packages/boards/
COPY packages/data/package.json packages/data/
COPY services/compiler/package.json services/compiler/
RUN pnpm install --frozen-lockfile --filter @codetochip/compiler...
COPY packages/boards packages/boards
COPY packages/data packages/data
COPY services/compiler/tsconfig.json services/compiler/
COPY services/compiler/src services/compiler/src

FROM ${WORKER_IMAGE}
USER root
COPY --from=app /usr/local/bin/node /usr/local/bin/node
COPY --from=app /repo /repo
# Jobs run in /work as the unprivileged user, who must be able to empty it between jobs.
RUN rm -rf /work && install -d -o builder -g builder /work
USER builder
WORKDIR /repo/services/compiler
ENV HOST=0.0.0.0 PORT=8080 ROLE=all WORKER_CONCURRENCY=1 SANDBOX_ISOLATION=instance
ENTRYPOINT []
CMD ["node", "--import", "tsx", "src/server.ts"]
