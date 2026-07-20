var $ = require('jquery');

// Check to see if there is a newer version available.
var fallbackVersion =
    require('../../dbm.json').version;


function pageApplicationVersion() {
    var element = document.querySelector(
        'meta[name="xronos-application-version"]'
    );

    if (!element) {
        return fallbackVersion;
    }

    return (
        element.getAttribute('content') ||
        fallbackVersion
    );
}


var version = pageApplicationVersion();

console.log(
    "This is XIMERA, Version " +
    version
);

$(function() {
    // Check which version the server is providing, avoiding the cache
	var version_endpoint = window.toValidPath("/version?");
	// console.log("VERSIONENDPOINT", version_endpoint);
	$.ajax(version_endpoint + (new Date().getTime()) )
	.done(function(data) {
            data = String(data).trim();
	    // If the server can offer a newer version, let's update
	    if (data != version) {
		if (sessionStorage.getItem('refreshedToVersion') == data) {
		    alert('Attempted to refresh; try a force refresh.');
		} else {
		    sessionStorage.setItem('refreshedToVersion',  data);

		    console.log("Uppdating from version " + version + " to version " + data );

		    // This is MAYBE needed in Chrome
		    $.ajax({
			url: window.location.href,
			headers: {
			    "Pragma": "no-cache",
			    "Expires": -1,
			    "Cache-Control": "no-cache"
			}
		    }).done(function () {
			window.location.reload(true);
		    });
		}
	    }
	});
});
