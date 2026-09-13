'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '../..');

var OLD_BLOCK = [
    '                        xronosUpdateGradeSyncStatus(result.gradeSync || null);',
    '',
    '                        recoveryStatus.text(',
    "                            'Grade sync rechecked: ' +",
    '                            gradeSyncPresentation.presentation(result.gradeSync).label +',
    "                            '.'",
    '                        );'
].join('\n');

var NEW_BLOCK = [
    '                        xronosUpdateGradeSyncStatus(result.gradeSync || null);',
    '',
    '                        // The modal was built from the pre-recheck state.',
    '                        // Close it after a successful recheck so reopening',
    '                        // help rebuilds the content from the fresh status.',
    "                        modal.modal('hide');"
].join('\n');

function countOccurrences(source, needle) {
    var count = 0;
    var position = 0;

    while (true) {
        position = source.indexOf(needle, position);
        if (position === -1) {
            return count;
        }
        count += 1;
        position += needle.length;
    }
}

function patchGradebook(source) {
    var oldCount = countOccurrences(source, OLD_BLOCK);
    var newCount = countOccurrences(source, NEW_BLOCK);

    if (newCount === 1 && oldCount === 0) {
        return source;
    }

    if (oldCount !== 1 || newCount !== 0) {
        throw new Error(
            'Expected exactly one stale successful-recheck modal block and no refreshed block.'
        );
    }

    return source.replace(OLD_BLOCK, NEW_BLOCK);
}

function patchFile() {
    var filename = path.join(root, 'public/javascripts/gradebook.js');
    var original = fs.readFileSync(filename, 'utf8');
    var updated = patchGradebook(original);

    if (updated === original) {
        console.log('Recovery modal refresh already integrated.');
        return;
    }

    fs.writeFileSync(filename, updated, 'utf8');
    console.log('Patched public/javascripts/gradebook.js');
    console.log('GRADE SYNC RECOVERY MODAL REFRESH PATCH APPLIED');
}

exports.OLD_BLOCK = OLD_BLOCK;
exports.NEW_BLOCK = NEW_BLOCK;
exports.countOccurrences = countOccurrences;
exports.patchGradebook = patchGradebook;

if (require.main === module) {
    patchFile();
}
