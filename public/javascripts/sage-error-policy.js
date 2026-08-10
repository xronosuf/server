"use strict";

function isCanonicalPageResultError(ename) {
    return ename === "XronosSagePageResultError";
}

module.exports = {
    isCanonicalPageResultError: isCanonicalPageResultError
};
