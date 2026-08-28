#!/usr/bin/env node
'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var repositoryName = process.argv[2] || 'davidxronosrepo';
var repositoriesRoot = process.env.XIMERA_REPOSITORIES_ROOT || path.resolve(__dirname, '../../repositories');
var repositoryPath = path.resolve(repositoriesRoot, repositoryName + '.git');

function git(args, encoding) {
  return childProcess.execFileSync(
    'git',
    ['--git-dir=' + repositoryPath].concat(args),
    {
      encoding: encoding === undefined ? 'utf8' : encoding,
      maxBuffer: 16 * 1024 * 1024
    }
  );
}

function gitText(args) {
  return git(args, 'utf8').trim();
}

function verifyRepository() {
  var stat = fs.statSync(repositoryPath);
  if (!stat.isDirectory()) {
    throw new Error('Repository path is not a directory: ' + repositoryPath);
  }

  if (gitText(['rev-parse', '--is-bare-repository']) !== 'true') {
    throw new Error('Expected a bare repository: ' + repositoryPath);
  }
}

function recentPublishedCommits(branchName, maxCommits) {
  var sourceShas = gitText([
    'rev-list',
    '--topo-order',
    '--date-order',
    '-n',
    String(maxCommits),
    'refs/heads/' + branchName
  ]).split(/\n/).filter(Boolean);

  return sourceShas.map(function(sourceSha) {
    try {
      var publicationSha = gitText([
        'rev-parse',
        '--verify',
        'refs/tags/publications/' + sourceSha + '^{commit}'
      ]);

      return {
        sourceSha: sourceSha,
        sha: publicationSha
      };
    } catch (err) {
      return null;
    }
  }).filter(Boolean);
}

function treeEntry(commitSha, pathname) {
  var output;

  try {
    output = gitText(['ls-tree', commitSha, '--', pathname]);
  } catch (err) {
    return null;
  }

  if (!output) {
    return null;
  }

  var tab = output.indexOf('\t');
  if (tab < 0) {
    throw new Error('Unexpected ls-tree output: ' + output);
  }

  var header = output.slice(0, tab).split(/\s+/);
  var entryPath = output.slice(tab + 1);

  return {
    mode: header[0],
    type: header[1],
    sha: header[2],
    path: entryPath
  };
}

function readBlob(blobHash) {
  var type = gitText(['cat-file', '-t', blobHash]);
  if (type !== 'blob') {
    throw new Error('Object is not a blob: ' + blobHash + ' (' + type + ')');
  }

  return git(['cat-file', 'blob', blobHash], null);
}

function main() {
  verifyRepository();

  var published = recentPublishedCommits('master', 100);
  if (!published.length) {
    throw new Error('No published commits found on master.');
  }

  var first = published[0];
  var htmlPath = 'aFirstFolder/aFirstActivity.html';
  var html = treeEntry(first.sha, htmlPath);
  var metadata = treeEntry(first.sha, 'metadata.json');

  if (!html || html.type !== 'blob') {
    throw new Error('Expected HTML blob not found: ' + htmlPath);
  }

  if (!metadata || metadata.type !== 'blob') {
    throw new Error('Expected metadata.json blob not found.');
  }

  var blob = readBlob(html.sha);

  console.log('Repository:', repositoryName);
  console.log('Bare repository: yes');
  console.log('Published commits found:', published.length);
  console.log('First source SHA:', first.sourceSha);
  console.log('First publication SHA:', first.sha);
  console.log('HTML path:', html.path);
  console.log('HTML hash:', html.sha);
  console.log('Metadata hash:', metadata.sha);
  console.log('HTML first 40 bytes:', JSON.stringify(blob.slice(0, 40).toString('utf8')));

  if (repositoryName === 'davidxronosrepo') {
    var expected = {
      sourceSha: '6d9183a6182c7353efe15f8595f955ba412c531d',
      publicationSha: '6d9183a6182c7353efe15f8595f955ba412c531d',
      htmlHash: '5ed799bc702a75054ce4fc031fe0ede524690fe6',
      metadataHash: 'e4f9ea5cb6ba67f8602aded13ab20b40ab9fedc0'
    };

    if (first.sourceSha !== expected.sourceSha) {
      throw new Error('Source SHA differs from captured NodeGit baseline.');
    }
    if (first.sha !== expected.publicationSha) {
      throw new Error('Publication SHA differs from captured NodeGit baseline.');
    }
    if (html.sha !== expected.htmlHash) {
      throw new Error('HTML blob hash differs from captured NodeGit baseline.');
    }
    if (metadata.sha !== expected.metadataHash) {
      throw new Error('metadata.json hash differs from captured NodeGit baseline.');
    }
  }

  console.log('GIT CLI READ PARITY PASSED');
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
