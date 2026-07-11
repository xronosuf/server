var $ = require('jquery');
var _ = require('underscore');
var Isotope = require('isotope-layout');

var activityCard = require('./activity-card');
var xourseIsotope = undefined;
var layoutMode = 'fitRows';
var search = undefined;
var xourseRelayoutMaskTimer = undefined;
var xourseRelayoutMaskActive = false;

var filtering = function() {
	var parts = $(this).closest('.xourse, .toc').find('.part');

	if ((typeof search === 'undefined') || (search.length == 0)) {
		if (parts.length === 0)
			return true;

		return $(this).hasClass('part') || parts.eq($(this).attr("data-part-counter") - 1).hasClass('part-open');
	} else {
		var regexps = _.map(search.toLowerCase().split(" "), function (word) {
			return new RegExp(word);
		});

		if ($(this).hasClass('part'))
			return true;

		if (parts.length > 0 && !parts.eq($(this).attr("data-part-counter") - 1).hasClass('part-open'))
			return false;

		var text = $(this).text().toLowerCase();

		return _.all(regexps, function (re) { return re.test(text); });
	}
}

var updateSearch = function() {
    if (!xourseIsotope) return;
    xourseIsotope.arrange({ filter: filtering });
	    scheduleXourseRelayout();   
};

var installXronosSidebarCompletionLabels = function() {
    var updateTimer = null;
    var roundToNearest = 1;

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    var percentFromCard = function(card) {
        var rawCompletion = card.getAttribute('data-max-completion');
        var n;
        var bar;
        var styleWidth;
        var match;
        var ariaValue;

        if (rawCompletion !== null && rawCompletion !== '') {
            n = Number(rawCompletion);
            if (Number.isFinite(n)) {
                return Math.max(0, Math.min(100, n * 100));
            }
        }

        bar = card.querySelector('.progress-bar');

        if (bar) {
            ariaValue = bar.getAttribute('aria-valuenow');
            if (ariaValue !== null && ariaValue !== '') {
                n = Number(ariaValue);
                if (Number.isFinite(n)) {
                    return Math.max(0, Math.min(100, n));
                }
            }

            styleWidth = bar.style && bar.style.width;
            match = styleWidth && String(styleWidth).match(/([\d.]+)%/);

            if (match) {
                n = Number(match[1]);
                if (Number.isFinite(n)) {
                    return Math.max(0, Math.min(100, n));
                }
            }
        }

        return null;
    };

    var directCompletionLabel = function(card) {
        var children = card.children;
        var i;

        for (i = 0; i < children.length; i++) {
            if (children[i].classList && children[i].classList.contains('xronos-completion-label')) {
                return children[i];
            }
        }

        return null;
    };

    var updateLabels = function() {
        document.querySelectorAll('.toc .activity-card, .xourse > .activity-card').forEach(function(card) {
            var percent;
            var rounded;
            var text;
            var label;

            if (card.classList.contains('card-sectionheading') || card.classList.contains('part')) {
                return;
            }

            percent = percentFromCard(card);

            if (percent === null) {
                return;
            }

            rounded = Math.round(percent / roundToNearest) * roundToNearest;

            if (rounded >= 100) {
                text = 'DONE';
            } else {
                text = rounded.toString() + '%';
            }

            label = directCompletionLabel(card);

            if (!label) {
                label = document.createElement('span');
                label.className = 'xronos-completion-label';
                label.setAttribute('aria-hidden', 'true');
                card.appendChild(label);
            }

            if (label.textContent !== text) {
                label.textContent = text;
            }

            if (rounded >= 100) {
                label.classList.add('xronos-completion-complete');
                card.classList.add('xronos-completion-card-complete');
            } else {
                label.classList.remove('xronos-completion-complete');
                card.classList.remove('xronos-completion-card-complete');
            }

            card.classList.add('xronos-has-completion-label');
        });
    };

    var scheduleUpdate = function() {
        window.clearTimeout(updateTimer);
        updateTimer = window.setTimeout(updateLabels, 100);
    };

    if (!window.xronosSidebarCompletionLabelsInstalled) {
        window.addEventListener('xronos:gradebookRecorded', scheduleUpdate);
        window.xronosSidebarCompletionLabelsInstalled = true;
    }

    document.querySelectorAll('.toc, .xourse').forEach(function(toc) {
        if (toc.xronosCompletionObserver) {
            toc.xronosCompletionObserver.disconnect();
        }

        if (typeof MutationObserver !== 'undefined') {
            toc.xronosCompletionObserver = new MutationObserver(scheduleUpdate);
            toc.xronosCompletionObserver.observe(toc, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: [
                    'data-max-completion',
                    'style',
                    'class',
                    'aria-valuenow',
                    'aria-valuemax'
                ]
            });
        }
    });

    updateLabels();

    window.xronosUpdateSidebarCompletionLabels = updateLabels;
};


var clearXourseSelection = function() {
    if (typeof window !== 'undefined' && window.getSelection) {
        try {
            window.getSelection().removeAllRanges();
        } catch (e) {
            // Ignore selection cleanup failures.
        }
    }
};

var preventXourseSelectionWhileMasked = function(event) {
    if (!xourseRelayoutMaskActive) {
        return;
    }

    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    clearXourseSelection();
};

var installXourseSelectionMaskHandlers = function(xourse) {
    $('.activity-card.part', xourse)
        .off('mousedown.xronosSelectionMask')
        .on('mousedown.xronosSelectionMask', function(event) {
            /*
             * Selection can start on mousedown before the normal click/fold
             * workflow applies the relayout mask.  Prevent only this initial
             * part-heading drag/selection gesture; normal tile text remains
             * selectable after the short relayout window.
             */
            event.preventDefault();
            maskXourseForRelayout();
        });
};

var maskXourseForRelayout = function() {
    var xourse;

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    xourse = document.querySelector('.xourse');

    if (!xourse || !xourse.classList) {
        return;
    }

    xourse.classList.add('xronos-grid-relayout-mask');
    xourseRelayoutMaskActive = true;
    clearXourseSelection();

    if (xourseRelayoutMaskTimer) {
        window.clearTimeout(xourseRelayoutMaskTimer);
    }

    xourseRelayoutMaskTimer = window.setTimeout(function() {
        clearXourseSelection();
        xourse.classList.remove('xronos-grid-relayout-mask');
        xourseRelayoutMaskActive = false;
        xourseRelayoutMaskTimer = undefined;
        clearXourseSelection();
    }, 150);
};

var relayoutXourse = function() {
    if (!xourseIsotope) return;

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('resize'));
    }

    if (typeof xourseIsotope.reloadItems === 'function') {
        xourseIsotope.reloadItems();
    }

    xourseIsotope.arrange({ filter: filtering });

    if (typeof xourseIsotope.layout === 'function') {
        xourseIsotope.layout();
    }
};

var scheduleXourseRelayout = function() {
    if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') {
        relayoutXourse();
        return;
    }

    maskXourseForRelayout();

    /*
     * Let the original arrange() call handle the immediate fold/unfold.
     * Then do short delayed re-measures after the DOM/class changes have
     * settled. Isotope transitions are disabled for this grid, so these can
     * run quickly enough to avoid visible temporary gaps.
     */
    window.setTimeout(relayoutXourse, 25);
    window.setTimeout(relayoutXourse, 125);
};

var layoutXourse = function( ) {
    var xourse = $(this);
    // console.log('layoutXourse for ');
    // console.log(xourse);

    $('.activity-card', xourse).activityCard();
    installXourseSelectionMaskHandlers(xourse);
    installXronosSidebarCompletionLabels();

	xourse.find('.part').each(function (index, value) {
		$(this).click(function () {
			$(value).toggleClass('part-open')
			xourseIsotope.arrange({ filter: filtering });
	    scheduleXourseRelayout();
		})
	})


	/* make sure the part with the current activity is open */
	document.querySelectorAll('.activity-card.active').forEach(function(crd) {
			$('.part').eq($(crd).attr("data-part-counter") - 1).addClass('part-open');
	})  	
	
	xourse.show();
    
    var options = {
	// layoutMode: 'fitRows',
	// layoutMode: 'vertical',
	layoutMode: layoutMode,
		transitionDuration: 0,
	itemSelector: '.activity-card',
	filter: filtering,
	animationOptions: {
	    duration: 0,
	    easing: 'linear',
	    queue: false
	}
    };

    xourseIsotope = new Isotope( xourse.get(0),
				 options );
};

// On document ready...
$(function() {
    $(document)
        .off('selectstart.xronosSelectionMask mousemove.xronosSelectionMask')
        .on('selectstart.xronosSelectionMask mousemove.xronosSelectionMask', preventXourseSelectionWhileMasked);

    $('#xourse-expand, #xourse-implode')
        .off('mousedown.xronosSelectionMask')
        .on('mousedown.xronosSelectionMask', function() {
            maskXourseForRelayout();
        });


	$('#xourse-expand').click(function(){
		$('.part').addClass('part-open')
		$('#xourse-implode').show()
		$('#xourse-expand').hide()
		xourseIsotope.arrange({ filter: filtering });
	    scheduleXourseRelayout();
	})
	
	$('#xourse-implode').click(function () {
		$('.part').removeClass('part-open')
		$('#xourse-implode').hide()
		$('#xourse-expand').show()
		xourseIsotope.arrange({ filter: filtering });
	    scheduleXourseRelayout();
	})

	var mainnav=$('.main-nav')[0];
	
	// If no toc present, hide it (otherwise empty space at left side of page)
	if ( $('.main-nav').length > 0 && ! mainnav.contains(mainnav.querySelector('.toc')) ) {
	           mainnav.classList.add("hidden");
		   // Hide now useless 'Toon/Verberg vooruitgang' button
                   $("#xmprogess-close").addClass("xmprogresshidden");
                   $("#xmprogess-open").addClass("xmprogresshidden");
	}

	// TOC toggle (main-nav)
	$('#toc-expand-btn').click(function(){
	        if (mainnav.classList.contains("hidden")) {
		   // Nav was hidden: remove "hidden" to show it again
	           mainnav.classList.remove("hidden");
		   // Hide progress, and show 'Toon vooruitgang' button
                   $("#xmprogess-open").removeClass("xmprogresshidden");
                   $(".progress").addClass("xmprogresshidden");
		} else {
		   // Nav was shown: hide it by adding class  "hidden" 
	           mainnav.classList.add("hidden");
		   // Hide now useless 'Toon/Verberg vooruitgang' button
                   $("#xmprogess-close").addClass("xmprogresshidden");
                   $("#xmprogess-open").addClass("xmprogresshidden");
	        }
	})
	// TOC toggle (progress)
	$('.xmhideprogress').click(function(){
           if ($("#xmprogess-close").hasClass("xmprogresshidden")) {
               $("#xmprogess-close").removeClass("xmprogresshidden");
               $("#xmprogess-open").addClass("xmprogresshidden");
               $(".progress").removeClass("xmprogresshidden");
           } else {
               $("#xmprogess-open").removeClass("xmprogresshidden");
               $("#xmprogess-close").addClass("xmprogresshidden");
               $(".progress").addClass("xmprogresshidden");
           }
	})

	// Menu toggle
	$('.toggle').click(function(){
           if ($(".item").hasClass("active")) {
               $(".item").removeClass("active");
           } else {
               $(".item").addClass("active");
           }
	})



    layoutMode = 'fitRows';
    $('.xourse').each( layoutXourse );

    layoutMode='vertical';
    $('.toc').each( layoutXourse );

    $('.xourse-search').on('input', function(e) {
		$('#xourse-clear').show();
		$('#xourse-search').hide();
		search = $(e.target).val();
		updateSearch();
    });
	
    $('#xourse-clear').click(function(e) {
		$('.xourse-search').val('');
		$('#xourse-clear').hide();
		$('#xourse-search').show();
		search = "";
		updateSearch();
    });
});

