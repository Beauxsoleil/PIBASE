// Shared install/update/offline behavior for the phone editor and Pi kiosk.
// Firebase handles cached records; this runtime keeps the application shell
// available and makes connectivity/update state visible to the user.

const isKiosk = /\/display\.html$/.test(window.location.pathname);
let reloading = false;
let lastInteraction = Date.now();
let waitingWorker = null;

if (isKiosk) {
  const noteInteraction = () => { lastInteraction = Date.now(); };
  document.addEventListener('keydown', noteInteraction, { passive: true });
  document.addEventListener('pointerdown', noteInteraction, { passive: true });
}

function reloadAfterKioskIdle() {
  const waitForIdle = () => {
    if (Date.now() - lastInteraction >= 60_000) window.location.reload();
    else setTimeout(waitForIdle, 30_000);
  };
  waitForIdle();
}

function installPhoneStatus() {
  if (isKiosk || document.getElementById('pibasePwaStatus')) return;
  const style = document.createElement('style');
  style.textContent = `
    #pibasePwaStatus{position:fixed;right:12px;bottom:12px;z-index:900;max-width:calc(100vw - 24px);display:none;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--line-bright,#3D4C41);border-radius:5px;background:rgba(20,27,23,.97);color:var(--text-muted,#8FA096);font-family:var(--font-mono,monospace);font-size:.65rem;letter-spacing:.03em;box-shadow:0 8px 24px rgba(0,0,0,.3)}
    #pibasePwaStatus.visible{display:flex}#pibasePwaStatus.offline{border-color:var(--rust,#C1543E);color:var(--text,#E9E6DC)}
    #pibasePwaStatus button{border:1px solid var(--brass,#C6A15B);border-radius:4px;background:transparent;color:var(--brass,#C6A15B);padding:5px 7px;font:inherit}
  `;
  document.head.appendChild(style);
  const status = document.createElement('div');
  status.id = 'pibasePwaStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.body.appendChild(status);
}

function showPhoneStatus(message, { offline = false, action = null } = {}) {
  if (isKiosk) return;
  installPhoneStatus();
  const status = document.getElementById('pibasePwaStatus');
  if (!status) return;
  status.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  status.appendChild(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.run, { once: true });
    status.appendChild(button);
  }
  status.classList.toggle('offline', offline);
  status.classList.add('visible');
}

function hidePhoneStatus() {
  document.getElementById('pibasePwaStatus')?.classList.remove('visible', 'offline');
}

function updateConnectivity() {
  if (!navigator.onLine) showPhoneStatus('Offline · cached data remains available', { offline: true });
  else if (waitingWorker) showPhoneStatus('PIBASE update ready', {
    action: { label: 'Refresh', run: () => waitingWorker?.postMessage({ type: 'SKIP_WAITING' }) }
  });
  else hidePhoneStatus();
  window.dispatchEvent(new CustomEvent('pibase:connectivity', { detail: { online: navigator.onLine } }));
}

async function registerPwa() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });

    const offerUpdate = worker => {
      if (!worker) return;
      if (isKiosk) {
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      waitingWorker = worker;
      updateConnectivity();
    };

    if (registration.waiting) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(installing);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      if (isKiosk) reloadAfterKioskIdle();
      else window.location.reload();
    });
  } catch (error) {
    console.warn('PIBASE offline shell unavailable', error);
  }
}

window.addEventListener('online', updateConnectivity);
window.addEventListener('offline', updateConnectivity);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installPhoneStatus();
    updateConnectivity();
    registerPwa();
  }, { once: true });
} else {
  installPhoneStatus();
  updateConnectivity();
  registerPwa();
}
