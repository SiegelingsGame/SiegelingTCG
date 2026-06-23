// Registers the Siegelings service worker (see /sw.js) for instant repeat loads
// and offline resilience. Kept tiny and standalone so it can be dropped onto any
// page. Registration failures are non-fatal — the app works fine without it.
(function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.warn('Service worker registration failed:', error);
        });
    });
})();
