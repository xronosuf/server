#!/bin/bash

set -o pipefail

# The repositories directory is normally bind-mounted from the host. Ensure it
# exists before using start-history/log files or looking for its .env file.
if [[ ! -d /usr/var/server/repositories ]]
then
    echo "Creating empty repositories folder"
    mkdir -p /usr/var/server/repositories
fi

# Load persistent deployment configuration before deciding which bundled
# services to start. This makes repositories/.env authoritative for external
# MongoDB/Redis configuration while preserving process-environment overrides.
if [[ -f /usr/var/server/repositories/.env ]]
then
    echo "Using .env in /usr/var/server/repositories"
    . /usr/var/server/repositories/.env
    if [[ -e /usr/var/server/.env ]]
    then
        if [[ -L /usr/var/server/.env ]]
        then
            echo "/usr/var/server/.env is a symbolic link, as expected."
        else
            echo "Mmm, /usr/var/server/.env is NOT a symbolic link. Strange ..."
        fi
    else
        echo "Linking .env from /usr/var/server/repositories"
        ln -s /usr/var/server/repositories/.env /usr/var/server/.env
    fi
fi

echo "Starting Xronos container services"
echo "$(date +%F_%X) Starting Xronos container services" >>/usr/var/server/repositories/start.history

LOGFILE=/usr/var/server/repositories/start.$(date +%Y%m%d_%H%M%S).log

# Historically this image starts MongoDB and Redis inside the Xronos app
# container. Keep that behavior by default so existing deployments continue to
# work, but allow either service to be moved into a dedicated container.
: ${XIMERA_START_MONGODB:=1}
: ${XIMERA_START_REDIS:=1}

if [[ "$XIMERA_START_REDIS" == "1" ]]
then
    echo "Starting bundled Redis"
    redis-server &
else
    echo "Skipping bundled Redis (XIMERA_START_REDIS=$XIMERA_START_REDIS)"
fi

if [[ "$XIMERA_START_MONGODB" == "1" ]]
then
    echo "Starting bundled MongoDB"
    mongod &
else
    echo "Skipping bundled MongoDB (XIMERA_START_MONGODB=$XIMERA_START_MONGODB)"
    if [[ -n "${XIMERA_MONGO_URI:-}" ]]
    then
        echo "External MongoDB configured through XIMERA_MONGO_URI"
    else
        echo "External MongoDB target: ${XIMERA_MONGO_URL:-127.0.0.1}"
    fi
fi

if [[ -e /usr/var/server/node_modules ]]
then
    echo "Using node_modules in /usr/var/server"
else
    echo "Linking node_modules from /usr/var/server.base  (ie, from the image)"
    ln -s /usr/var/server.base/node_modules /usr/var/server/node_modules
fi

if [[ -z "$SKIP_NPM_BUILD" ]]
then
    # This is needed when building a docker-image directly from a git-checkout: the .css/min.js etc are not there!
    echo "Running npm run build"
    npm run build
else
    sleep 5 # give backing services time to start ...
fi

# the default in the docker image might very well be port 3000 ...
: ${PORT:=2000}
export PORT

# Keep the historical per-start logfile without leaving a shell/npm pipeline as
# PID 1. Podman sends SIGTERM to PID 1 when stopping the container; making the
# Node process PID 1 lets it receive that signal directly instead of forcing
# Podman to wait for a shell pipeline and eventually SIGKILL the container.
echo "Starting node app.js"
exec > >(tee "$LOGFILE") 2>&1
exec node app.js
