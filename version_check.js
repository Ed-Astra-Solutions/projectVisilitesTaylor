// Auto-refresh on new deploy.
//
// GitHub Pages serves this app from a service worker cache, so a pushed update
// would otherwise sit unseen until the tailor happened to hard-reload. Two
// mechanisms cover it:
//
//   1. Service worker — when a new worker takes control, the page reloads.
//   2. Poll of version.json — catches the case where the worker is already
//      installed and the browser has not re-checked it, and covers browsers
//      where the controllerchange event does not fire reliably.
//
// A reload only happens when the build actually changed, and never while the
// tailor is mid-edit (see `isBusy`).
(function () {
  var POLL_MS = 5 * 60 * 1000; // every 5 minutes
  var currentBuild = null;
  var reloading = false;

  function reload(reason) {
    if (reloading) return;
    reloading = true;
    console.info('[visilites] updating to new build (' + reason + ')');
    // replace() so the stale page does not stay in history.
    window.location.reload();
  }

  // Never interrupt someone typing — a reload would lose an OTP or a
  // half-written complaint. Retry on the next tick instead.
  function isBusy() {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return true;
    return document.visibilityState !== 'visible';
  }

  function checkVersion() {
    // cache: 'no-store' so we ask the network, not the worker cache.
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v) return;
        var build = v.version + '+' + v.build_number;
        if (currentBuild === null) { currentBuild = build; return; }
        if (build !== currentBuild && !isBusy()) reload('version.json ' + build);
      })
      .catch(function () { /* offline — try again next tick */ });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!isBusy()) reload('service worker');
    });
  }

  checkVersion();
  setInterval(checkVersion, POLL_MS);
  // Also check when the tailor returns to the tab.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkVersion();
  });
})();
