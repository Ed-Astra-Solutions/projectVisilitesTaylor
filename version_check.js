// Auto-refresh on new deploy.
//
// The app is served from a service-worker cache, so a pushed update would
// otherwise sit unseen until the tailor happened to clear site data.
//
// The comparison that matters is: "is the build RUNNING in this page the same
// as the build on the server?" An earlier version of this file compared the
// server against itself — it recorded the first fetched version.json as the
// baseline, so a client stuck on an old bundle adopted the new number without
// ever reloading, and then matched forever.
//
// deploy_web.sh stamps window.__APP_BUILD__ into index.html at publish time,
// which is the build actually running here.
(function () {
  var POLL_MS = 5 * 60 * 1000;
  var RUNNING = window.__APP_BUILD__ || null;
  var reloading = false;

  // Never interrupt someone typing — a reload would lose an OTP or a
  // half-written complaint.
  function isBusy() {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return true;
    return document.visibilityState !== 'visible';
  }

  // A plain reload re-reads from the service worker cache and changes nothing,
  // so drop the worker and its caches first, then reload.
  function update(serverBuild) {
    if (reloading) return;
    reloading = true;
    console.info('[visilites] ' + RUNNING + ' -> ' + serverBuild + ', updating');

    var done = function () { window.location.reload(); };

    var jobs = [];
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
    if ('serviceWorker' in navigator) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    // Never hang on a wedged worker — reload regardless after 3s.
    Promise.all(jobs).then(done).catch(done);
    setTimeout(done, 3000);
  }

  function checkVersion() {
    if (reloading) return;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v) return;
        var serverBuild = v.version + '+' + v.build_number;

        // Without the stamp we cannot tell stale from current, and guessing
        // would mean reloading on every poll. Log once and stop.
        if (!RUNNING) {
          console.warn('[visilites] no __APP_BUILD__ stamp; auto-update disabled');
          return;
        }
        if (serverBuild !== RUNNING && !isBusy()) update(serverBuild);
      })
      .catch(function () { /* offline — try again next tick */ });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!isBusy() && !reloading) window.location.reload();
    });
  }

  checkVersion();
  setInterval(checkVersion, POLL_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkVersion();
  });
})();
