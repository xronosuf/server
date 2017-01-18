#!/bin/bash
if [ $(hostname) = ximera-1.asc.ohio-state.edu ]; then
    echo On the deployment machine.
    echo Pulling latest version from github...
    mv -f environment.sh environment.backup
    git pull
    mv -f environment.backup environment.sh
    echo Updating npm...
    npm install
    echo Running gulp...
    node ./node_modules/gulp/bin/gulp.js js
    node ./node_modules/gulp/bin/gulp.js css    
    echo Stopping old copies of app.js...
    ./node_modules/forever/bin/forever -c /home/deploy/local/bin/node stop ximera
    echo Starting a new copy of app.js...
    source environment.sh
    export DEPLOYMENT=production
    export NODE_ENV=production
    ./node_modules/forever/bin/forever -c /home/deploy/local/bin/node --uid "ximera" start -a -l forever.log -o out.log -e err.log app.js &
else
    echo not on the deployment machine...
    echo copying environment and key to deployment machine...
    rsync -avz -f"- .git/" private_key.pem environment.sh ximera:/var/www/apps/ximera
    ssh ximera "cd /var/www/apps/ximera ; source deploy.sh"
fi
