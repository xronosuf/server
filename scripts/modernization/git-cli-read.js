'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

function repositoryPath(repositoriesRoot, repositoryName) {
  return path.resolve(repositoriesRoot, repositoryName + '.git');
}

function runGit(repository, args, options) {
  options = options || {};

  return new Promise(function(resolve, reject) {
    childProcess.execFile(
      'git',
      ['--git-dir=' + repository].concat(args),
      {
        encoding: options.encoding === undefined ? 'utf8' : options.encoding,
        maxBuffer: options.maxBuffer || 16 * 1024 * 1024
      },
      function(err, stdout, stderr) {
        if (err) {
          err.gitStderr = stderr;
          reject(err);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function runGitText(repository, args) {
  return runGit(repository, args, { encoding: 'utf8' })
    .then(function(stdout) {
      return stdout.trim();
    });
}

function verifyRepository(repositoriesRoot, repositoryName) {
  var repository = repositoryPath(repositoriesRoot, repositoryName);

  return new Promise(function(resolve, reject) {
    fs.stat(repository, function(err, stat) {
      if (err) {
        reject(err);
        return;
      }

      if (!stat.isDirectory()) {
        reject(new Error('Repository path is not a directory: ' + repository));
        return;
      }

      runGitText(repository, ['rev-parse', '--is-bare-repository'])
        .then(function(result) {
          if (result !== 'true') {
            throw new Error('Expected a bare repository: ' + repository);
          }

          resolve(repository);
        })
        .catch(reject);
    });
  });
}

function recentPublishedCommits(repository, branchName, maxCommits) {
  return runGitText(repository, [
    'rev-list',
    '--topo-order',
    '--date-order',
    '-n',
    String(maxCommits),
    'refs/heads/' + branchName
  ]).then(function(output) {
    var sourceShas = output.split(/\n/).filter(Boolean);

    return Promise.all(sourceShas.map(function(sourceSha) {
      return runGitText(repository, [
        'rev-parse',
        '--verify',
        'refs/tags/publications/' + sourceSha + '^{commit}'
      ]).then(function(publicationSha) {
        return {
          sourceSha: sourceSha,
          sha: publicationSha
        };
      }).catch(function() {
        return null;
      });
    }));
  }).then(function(results) {
    return results.filter(Boolean);
  });
}

function treeEntry(repository, commitSha, pathname) {
  return runGitText(repository, [
    'ls-tree',
    commitSha,
    '--',
    pathname
  ]).then(function(output) {
    if (!output) {
      return null;
    }

    var tab = output.indexOf('\t');
    if (tab < 0) {
      throw new Error('Unexpected ls-tree output: ' + output);
    }

    var header = output.slice(0, tab).split(/\s+/);

    return {
      mode: header[0],
      type: header[1],
      sha: header[2],
      path: output.slice(tab + 1)
    };
  }).catch(function(err) {
    if (err && err.code === 128) {
      return null;
    }

    throw err;
  });
}

function recursiveTreeEntries(repository, commitSha, pathname) {
  var args = ['ls-tree', '-r', '-z', commitSha];

  if (pathname) {
    args.push('--', pathname);
  }

  return runGit(repository, args, { encoding: null })
    .then(function(output) {
      return output.toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map(function(record) {
          var tab = record.indexOf('\t');
          if (tab < 0) {
            throw new Error('Unexpected ls-tree record: ' + record);
          }

          var header = record.slice(0, tab).split(/\s+/);

          return {
            mode: header[0],
            type: header[1],
            sha: header[2],
            path: record.slice(tab + 1)
          };
        });
    });
}

function readBlob(repository, blobHash) {
  return runGitText(repository, ['cat-file', '-t', blobHash])
    .then(function(type) {
      if (type !== 'blob') {
        throw new Error(
          'Object is not a blob: ' + blobHash + ' (' + type + ')'
        );
      }

      return runGit(repository, ['cat-file', 'blob', blobHash], {
        encoding: null
      });
    });
}

module.exports = {
  repositoryPath: repositoryPath,
  runGit: runGit,
  runGitText: runGitText,
  verifyRepository: verifyRepository,
  recentPublishedCommits: recentPublishedCommits,
  treeEntry: treeEntry,
  recursiveTreeEntries: recursiveTreeEntries,
  readBlob: readBlob
};
