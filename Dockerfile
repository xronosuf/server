FROM docker.io/library/node:24-bookworm

WORKDIR /usr/var/server

# Xronos still builds several native dependencies and uses the git CLI at
# runtime for repository operations. Keep the toolchain that was validated by
# the Node 24 modernization rehearsal.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      git \
      pkg-config \
      python3 \
 && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first so source-only changes can reuse the npm
# install layer. npm ci installs exactly the graph recorded in package-lock.
COPY package.json package-lock.json ./
RUN echo "Node: $(node --version)" \
 && echo "npm:  $(npm --version)" \
 && npm ci --no-audit --no-fund

# Runtime data and secrets are excluded by .dockerignore and supplied through
# the persistent repositories bind mount at deployment time.
COPY . .

EXPOSE 2000

# start.sh loads repositories/.env, honors external Mongo/Redis settings,
# builds browser assets, and execs the graceful Node PID-1 supervisor.
ENTRYPOINT ["./start.sh"]
