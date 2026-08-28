#!/bin/bash

set -o pipefail

echo "Starting Xronos container services"
echo "$(date +%F_%X) Starting Xronos container services" >>/usr/var/server/repositories/start.history

LOGFILE=/usr/var/server/repositories/start.$(date +%Y%m%d_%H%M%S).log

# Historically this image starts MongoDB and Redis inside the Xronos app
# container.  Keep that behavior by default so existing deployments continue
# to work, but allow either service to be moved into a dedicated container.
#
# Set XIMERA_START_MONGODB=0 when XIMERA_MONGO_URL points at an external
# MongoDB service.  Set XIMERA_START_REDIS=0 when XIMERA_REDIS_URL points at an
# external Redis service.
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
    echo "External MongoDB target: ${XIMERA_MONGO_URL:-127.0.0.1}"
fi


if [[ -e /usr/var/server/node_modules ]]
then
    echo "Using node_modules in /usr/var/server"
else
    echo "Linking node_modules from /usr/var/server.base  (ie, from the image)"
    ln -s /usr/var/server.base/node_modules /usr/var/server/node_modules
fi

if [[ ! -d /usr/var/server/repositories ]]
then
    echo "Using creating empty repositories folder"
    mkdir /usr/var/server/repositories
fi


# Use .env in repositories, because that folder is presumably mounted
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

echo "Starting npm"
npm run start 2>&1 | tee "$LOGFILE"
