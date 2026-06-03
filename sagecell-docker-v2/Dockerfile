# syntax=docker/dockerfile:1.7
#
# SageCell/SageMathCell container intended for Xronos/Ximera server-side
# Sage randomization requests.
#
# Default build is SERVICE-ONLY: it deliberately does not run SageCell's
# npm/webpack static asset build, because that is the fragile part of the
# upstream install and is not needed for the /service endpoint used by Xronos.
#
# Build:
#   docker build -t local/sagecell-xronos .
#
# Optional full static build, if you also want the browser UI assets built:
#   docker build --build-arg BUILD_STATIC=1 -t local/sagecell-xronos:full .
#
# Run:
#   docker run --rm -p 8888:8888 --name sagecell local/sagecell-xronos

ARG SAGEMATH_TAG=10.9
FROM sagemath/sagemath:${SAGEMATH_TAG}

ARG SAGECELL_GIT_REF=master
ARG BUILD_STATIC=0

USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    SAGECELL_HOME=/opt/sagecell \
    SAGECELL_PORT=8888 \
    SAGECELL_WORKDIR=/tmp/sagecell \
    SAGECELL_DB=/var/lib/sagecell/sqlite.db \
    SAGECELL_MAX_KERNELS=4 \
    SAGECELL_MAX_PREFORKED=1 \
    SAGECELL_RLIMIT_CPU=30 \
    PYTHONUNBUFFERED=1

# The base Sage image has Sage itself. We add only the container/runtime pieces
# SageCell needs: git, curl, an internal sshd for localhost provider startup,
# and Node/npm only when we ask for the optional static build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssh-client \
        openssh-server \
        procps \
        tini \
        $(if [[ "${BUILD_STATIC}" == "1" ]]; then echo "nodejs npm make"; else echo "make"; fi) \
    && rm -rf /var/lib/apt/lists/*

# SageMath's Docker images normally already have a non-root user named 'sage'.
# Keep this idempotent in case that ever changes.
RUN if ! id -u sage >/dev/null 2>&1; then useradd -m -s /bin/bash sage; fi \
    && mkdir -p /run/sshd "$SAGECELL_WORKDIR" /var/lib/sagecell \
    && chown -R sage:sage "$SAGECELL_WORKDIR" /var/lib/sagecell

# SageCell starts kernel providers over ssh, even for localhost. Configure a
# passwordless localhost ssh path inside the container.
RUN ssh-keygen -A \
    && printf '%s\n' \
        'PasswordAuthentication no' \
        'PermitRootLogin no' \
        'PubkeyAuthentication yes' \
        'AllowUsers sage' \
        > /etc/ssh/sshd_config.d/sagecell.conf \
    && install -d -o sage -g sage -m 700 /home/sage/.ssh \
    && ssh-keygen -t ed25519 -N '' -f /home/sage/.ssh/id_ed25519 \
    && cp /home/sage/.ssh/id_ed25519.pub /home/sage/.ssh/authorized_keys \
    && printf '%s\n' \
        'Host localhost 127.0.0.1' \
        '    StrictHostKeyChecking no' \
        '    UserKnownHostsFile /dev/null' \
        '    LogLevel ERROR' \
        > /home/sage/.ssh/config \
    && chown -R sage:sage /home/sage/.ssh \
    && chmod 700 /home/sage/.ssh \
    && chmod 600 /home/sage/.ssh/authorized_keys /home/sage/.ssh/id_ed25519 /home/sage/.ssh/config \
    && chmod 644 /home/sage/.ssh/id_ed25519.pub

USER sage
WORKDIR /opt

RUN git clone --depth=1 --branch "${SAGECELL_GIT_REF}" https://github.com/sagemath/sagecell.git "$SAGECELL_HOME"

WORKDIR $SAGECELL_HOME

# Python dependencies explicitly listed by SageCell, plus psutil which SageCell
# imports in current code paths. Pinning is intentionally light because these
# install into Sage's own Python environment.
RUN sage -pip install --no-cache-dir \
        lockfile \
        paramiko \
        psutil \
        sockjs-tornado \
        sqlalchemy

# Service-only is what Xronos needs. Avoid the brittle npm/webpack/JSmol build
# unless BUILD_STATIC=1 is requested. The optional build includes a small
# preflight/fallback for the JSmol file assumed by the Makefile, since that is
# one common Sage-image mismatch.
RUN if [[ "${BUILD_STATIC}" == "1" ]]; then \
        mkdir -p static/jsmol static/threejs build/vendor; \
        if [[ ! -e static/jsmol/JSmol.min.nojq.js ]]; then \
            printf '/* JSmol fallback placeholder: not needed for /service */\n' > static/jsmol/JSmol.min.nojq.js; \
        fi; \
        sage -sh -c 'make'; \
    else \
        echo 'Skipping SageCell static JS build; /service endpoint does not need it.'; \
    fi

# Minimal local configuration for one-container operation.
RUN cat > config.py <<'PY'
import os
from config_default import *

requires_tos = False

dir = os.environ.get("SAGECELL_WORKDIR", "/tmp/sagecell")
pid_file = "/tmp/sagecell.pid"
permalink_pid_file = "/tmp/sagecell_permalink_server.pid"

sqlite_path = os.environ.get("SAGECELL_DB", "/var/lib/sagecell/sqlite.db")
db = "sqlalchemy"
db_config = {"uri": "sqlite:///" + sqlite_path}
permalink_server = {
    "db": "sqlalchemy",
    "db_config": {"uri": "sqlite:///" + sqlite_path},
}

provider_settings = {
    "max_kernels": int(os.environ.get("SAGECELL_MAX_KERNELS", "4")),
    "max_preforked": int(os.environ.get("SAGECELL_MAX_PREFORKED", "1")),
    "preforked_rlimits": {
        "RLIMIT_CPU": int(os.environ.get("SAGECELL_RLIMIT_CPU", "30")),
    },
}

sage = os.environ.get("SAGE_BIN", "sage")
provider_info = {
    "host": "localhost",
    "username": os.environ.get("SAGECELL_SSH_USER", "sage"),
    "python": sage + " -python",
    "location": os.path.dirname(os.path.abspath(__file__)),
}
providers = [provider_info]
PY

USER root
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY healthcheck.sh /usr/local/bin/healthcheck.sh
COPY smoke-test.sh /usr/local/bin/sagecell-smoke-test
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/healthcheck.sh /usr/local/bin/sagecell-smoke-test \
    && chown -R sage:sage "$SAGECELL_HOME" "$SAGECELL_WORKDIR" /var/lib/sagecell

EXPOSE 8888
VOLUME ["/var/lib/sagecell"]

HEALTHCHECK --interval=30s --timeout=30s --start-period=180s --retries=5 \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["sagecell"]
