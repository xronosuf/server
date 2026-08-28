#!/usr/bin/env node
'use strict';

var assert = require('assert');
var path = require('path');

var config = require('../../config');
var repositories = require('../../routes/repositories');
var gitCli = require('./git-cli-read');

var repositoryName = process.argv[2] || 'davidxronosrepo';
var branchName = process.argv[3] || 'master';
var paths = process.argv.slice(4);

if (!paths.length) {
  paths = [
    'aFirstFolder/aFirstActivity',
    'aFirstXourse',
    'testcourse',
    'testpractice'
  ];
}

var repositoriesRoot = config.repositories.root;

function downloadsFromActivity(repository, activityPath, commitSha) {
  var activityFilePathWithoutExtension =
    activityPath.split('.').slice(0, -1).join('.');

  return gitCli.recursiveTreeEntries(
    repository,
    commitSha,
    'ximera-downloads'
  ).then(function(entries) {
    return entries
      .map(function(entry) {
        return entry.path;
      })
      .map(function(p) {
        return {
          p: p,
          m: p.match(
            new RegExp(
              'ximera-downloads/(([^/]*)/' +
              activityFilePathWithoutExtension +
              '\\..*)$'
            )
          )
        };
      })
      .filter(function(item) {
        return item.m;
      })
      .map(function(item) {
        var label = item.m[2];
        return {
          label: label,
          url: config.toValidPath('/' + repositoryName + '/' + item.p)
        };
      });
  });
}

function possiblePaths(pathname) {
  var parts = pathname.split('/');
  var result = [];

  for (var i = 0; i <= parts.length; i++) {
    var partialPath = parts.slice(0, i).join('/');
    var remainder = parts.slice(i).join('/');

    result.push({
      path: partialPath + '.html',
      remainder: remainder
    });
    result.push({
      path: partialPath + '.html',
      remainder: remainder + '.html'
    });
  }

  return result;
}

async function cliActivity(repository, publication, pathname) {
  var activity = {
    sha: publication.sha,
    sourceSha: publication.sourceSha
  };

  var candidates = possiblePaths(pathname);

  for (var i = 0; i < candidates.length; i++) {
    var item = candidates[i];
    var entry = await gitCli.treeEntry(
      repository,
      publication.sha,
      item.remainder
    );

    if (!entry || entry.type !== 'blob') {
      continue;
    }

    activity.activityHash = entry.sha;
    activity.hash = entry.sha;
    activity.path = entry.path;
    activity.downloads = await downloadsFromActivity(
      repository,
      activity.path,
      publication.sha
    );

    var xourse = await gitCli.treeEntry(
      repository,
      publication.sha,
      item.path
    );

    if (!xourse || xourse.type !== 'blob') {
      continue;
    }

    activity.xourse = {
      path: xourse.path,
      hash: xourse.sha
    };

    activity.downloads_xourse = await downloadsFromActivity(
      repository,
      xourse.path,
      publication.sha
    );

    var metadata = await gitCli.treeEntry(
      repository,
      publication.sha,
      'metadata.json'
    );

    if (metadata && metadata.type === 'blob') {
      activity.metadataHash = metadata.sha;
    }

    break;
  }

  return activity;
}

function normalize(activity) {
  return {
    sha: activity.sha,
    sourceSha: activity.sourceSha,
    activityHash: activity.activityHash,
    hash: activity.hash,
    path: activity.path,
    xourse: activity.xourse,
    metadataHash: activity.metadataHash,
    downloads: activity.downloads,
    downloads_xourse: activity.downloads_xourse
  };
}

async function main() {
  var repository = await gitCli.verifyRepository(
    repositoriesRoot,
    repositoryName
  );

  var publications = await gitCli.recentPublishedCommits(
    repository,
    branchName,
    100
  );

  if (!publications.length) {
    throw new Error('No publications found');
  }

  for (var i = 0; i < paths.length; i++) {
    var pathname = paths[i];

    var nodegitActivities =
      await repositories.activitiesFromRecentCommits(
        repositoryName,
        branchName,
        pathname
      );

    var cliActivities = await Promise.all(
      publications.map(function(publication) {
        return cliActivity(repository, publication, pathname);
      })
    );

    var nodegitNormalized = nodegitActivities.map(normalize);
    var cliNormalized = cliActivities.map(normalize);

    console.log('');
    console.log('PATH:', pathname);
    console.log('NodeGit:', JSON.stringify(nodegitNormalized));
    console.log('Git CLI:', JSON.stringify(cliNormalized));

    assert.deepStrictEqual(
      cliNormalized,
      nodegitNormalized,
      'Activity output differs for ' + pathname
    );

    console.log('MATCH: yes');
  }

  console.log('');
  console.log('NODEGIT / GIT CLI ACTIVITY SHADOW COMPARISON PASSED');
}

main().then(function() {
  process.exit(0);
}).catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
