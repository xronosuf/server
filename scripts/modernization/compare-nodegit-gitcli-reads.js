'use strict';

var path = require('path');
var repositories = require('../../routes/repositories');
var gitCli = require('./git-cli-read');
var config = require('../../config');

var repositoryName = process.argv[2] || 'davidxronosrepo';
var blobHash = process.argv[3] || '5ed799bc702a75054ce4fc031fe0ede524690fe6';
var repositoriesRoot = config.repositories.root;

async function main() {
  var repository = await gitCli.verifyRepository(repositoriesRoot, repositoryName);

  var results = await Promise.all([
    repositories.readBlob(repositoryName, blobHash),
    gitCli.readBlob(repository, blobHash)
  ]);

  var nodegitBlob = results[0];
  var gitCliBlob = results[1];

  if (!Buffer.isBuffer(nodegitBlob)) {
    nodegitBlob = Buffer.from(nodegitBlob);
  }

  console.log('Repository:', repositoryName);
  console.log('Blob hash:', blobHash);
  console.log('NodeGit bytes:', nodegitBlob.length);
  console.log('Git CLI bytes:', gitCliBlob.length);
  console.log('Buffers equal:', nodegitBlob.equals(gitCliBlob));
  console.log('First 40 bytes:', JSON.stringify(gitCliBlob.slice(0, 40).toString('utf8')));

  if (!nodegitBlob.equals(gitCliBlob)) {
    throw new Error('NodeGit and Git CLI blob contents differ.');
  }

  var published = await gitCli.recentPublishedCommits(repository, 'master', 100);
  if (!published.length) {
    throw new Error('No published commits found on master.');
  }

  var first = published[0];
  var html = await gitCli.treeEntry(repository, first.sha, 'aFirstFolder/aFirstActivity.html');
  var metadata = await gitCli.treeEntry(repository, first.sha, 'metadata.json');

  console.log('First source SHA:', first.sourceSha);
  console.log('First publication SHA:', first.sha);
  console.log('HTML hash:', html && html.sha);
  console.log('Metadata hash:', metadata && metadata.sha);

  if (first.sourceSha !== '6d9183a6182c7353efe15f8595f955ba412c531d') {
    throw new Error('Published source SHA differs from baseline.');
  }
  if (first.sha !== '6d9183a6182c7353efe15f8595f955ba412c531d') {
    throw new Error('Publication SHA differs from baseline.');
  }
  if (!html || html.sha !== '5ed799bc702a75054ce4fc031fe0ede524690fe6') {
    throw new Error('HTML tree lookup differs from baseline.');
  }
  if (!metadata || metadata.sha !== 'e4f9ea5cb6ba67f8602aded13ab20b40ab9fedc0') {
    throw new Error('Metadata tree lookup differs from baseline.');
  }

  console.log('NODEGIT / GIT CLI SHADOW READ COMPARISON PASSED');
}

main().then(function() {
  process.exit(0);
}).catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
