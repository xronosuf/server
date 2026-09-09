var assert = require('assert');
var fs = require('fs');

function source(path) {
    return fs.readFileSync(path, 'utf8');
}

describe('YouTube progress contracts', function() {
    it('awards full video progress at the eighty-percent threshold', function() {
        var progress = source('public/javascripts/progress-bar.js');

        assert(
            progress.indexOf('var VIDEO_COMPLETE_THRESHOLD = 0.8;') !== -1
        );

        assert(
            progress.indexOf('fraction >= VIDEO_COMPLETE_THRESHOLD') !== -1
        );
    });

    it('uses a delegated progress event that survives YouTube DOM replacement', function() {
        var progress = source('public/javascripts/progress-bar.js');
        var youtube = source('public/javascripts/youtube.js');

        assert(
            progress.indexOf("'ximera:youtube-progress.xronos-progress'") !== -1
        );

        assert(
            progress.indexOf("'.youtube-player'") !== -1
        );

        assert(
            youtube.indexOf("container.trigger('ximera:youtube-progress')") !== -1
        );
    });

    it('does not depend on a direct persistent-data listener on the replaceable player node', function() {
        var progress = source('public/javascripts/progress-bar.js');

        assert.strictEqual(
            progress.indexOf("$('.youtube-player', activity).each( function() {\n\t    $(this).persistentData( update );\n\t});"),
            -1
        );
    });
});
