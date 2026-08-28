#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var gitCli = require('./git-cli-read');

var repositoryName = process.argv[2] || 'davidxronosrepo';
var repositoriesRoot = process.env.XIMERA_REPOSITORIES_ROOT || path.resolve(__dirname, '../../repositories');

async function main() {
  var repository = await gitCli.verifyRepository(repositoriesRoot, repositoryName);

  var published = await gitCli.recentPublishedCommits(repository, 'master', 100);
  if (!published.length) {
    throw new Error('No published commits found on master.');
  }

  var first = published[0];
  var htmlPath = 'aFirstFolder/aFirstActivity.html';
  var html = await gitCli.treeEntry(repository, first.sha, htmlPath);
  var metadata = await gitCli.treeEntry(repository, first.sha, 'metadata.json');

  if (!html || html.type !== 'blob') {
    throw new Error('Expected HTML blob not found: ' + htmlPath);
  }

  if (!metadata || metadata.type !== 'blob') {
    throw new Error('Expected metadata.json blob not found.');
  }

  var blob = await gitCli.readBlob(repository, html.sha);

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

main().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
