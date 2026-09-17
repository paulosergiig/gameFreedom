const release = document.querySelector('meta[name="freedom-release"]')?.content;
const releasePattern = /^[a-f0-9]{64}$/;
let loaded = false, checking = false, navigating = false, pendingRelease = null;
let retryTimer, retryStyles = false, allowRecoveryReload = false;

function retryLater(allowReload = false) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { allowRecoveryReload = allowReload; checkRelease(); }, 15000);
}
function showConnectionNotice() {
  if (loaded) return;
  const notice = document.querySelector('#toast');
  if (!notice) return;
  notice.dataset.bootNotice = 'true';
  notice.textContent = 'Conectando à pista… A página será atualizada automaticamente.';
  notice.hidden = false;
}
async function currentRelease() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/version', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error('Version unavailable');
    const { version } = await response.json();
    if (!releasePattern.test(version)) throw new Error('Invalid release');
    return version;
  } finally { clearTimeout(timer); }
}
function refreshDocument(version) {
  pendingRelease = version;
  if (document.hidden || document.body.classList.contains('is-playing')) return;
  const url = new URL(location.href);
  // A stale HTML response or unavailable asset must not cause a reload loop.
  if (url.searchParams.get('__release') === version && !allowRecoveryReload) return;
  allowRecoveryReload = false;
  url.searchParams.set('__release', version);
  navigating = true;
  location.replace(url.href);
}
function stylesReady(link) {
  try { return Boolean(link.sheet?.cssRules.length); } catch { return false; }
}
async function waitForStyles() {
  let link = document.querySelector('link[rel="stylesheet"]');
  if (!link) throw new Error('Stylesheet missing');
  if (stylesReady(link)) return;
  if (retryStyles) {
    const replacement = link.cloneNode();
    const url = new URL(link.href);
    url.searchParams.set('__retry', String(Date.now()));
    replacement.href = url.href;
    link.replaceWith(replacement);
    link = replacement;
  }
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      link.removeEventListener('load', onLoad);
      link.removeEventListener('error', onError);
      retryStyles = Boolean(error);
      if (error) reject(error); else resolve();
    };
    const onLoad = () => finish(stylesReady(link) ? null : new Error('Stylesheet unavailable'));
    const onError = () => finish(new Error('Stylesheet unavailable'));
    const timer = setTimeout(onError, 8000);
    link.addEventListener('load', onLoad);
    link.addEventListener('error', onError);
    if (stylesReady(link)) onLoad();
  });
}
async function checkRelease() {
  if (checking || navigating || document.hidden) return;
  checking = true;
  clearTimeout(retryTimer);
  let confirmedRelease;
  try {
    confirmedRelease = await currentRelease();
    if (confirmedRelease !== release) {
      refreshDocument(confirmedRelease);
      if (!navigating) { showConnectionNotice(); retryLater(); }
      return;
    }
    pendingRelease = null;
    if (loaded) return;
    await waitForStyles();
    await import(`/static/${release}/app.js`);
    loaded = true;
    const notice = document.querySelector('[data-boot-notice]');
    if (notice) { notice.hidden = true; delete notice.dataset.bootNotice; }
    const url = new URL(location.href);
    if (url.searchParams.get('__release') === release) {
      url.searchParams.delete('__release');
      history.replaceState(history.state, '', url.href);
    }
  } catch {
    showConnectionNotice();
    // A deployment can happen between the version check and a module/CSS fetch.
    if (!loaded && confirmedRelease) {
      const latest = await currentRelease().catch(() => confirmedRelease);
      refreshDocument(latest);
      // Failed module imports can stay rejected in the document's module map.
      // Retry that document after a delay, but never repeat stale-HTML redirects.
      if (!navigating) retryLater(latest === release);
    } else if (!navigating) retryLater();
  } finally { checking = false; }
}
window.addEventListener('online', () => { allowRecoveryReload = true; checkRelease(); });
window.addEventListener('pageshow', event => { if (event.persisted) checkRelease(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRelease(); });
new MutationObserver(() => {
  if (pendingRelease && !document.body.classList.contains('is-playing')) checkRelease();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
checkRelease();
