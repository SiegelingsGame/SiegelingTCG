/**
 * Notifies open Sieglings tabs when the card dashboard publishes catalog changes.
 * Uses BroadcastChannel (same origin) and localStorage (cross-tab fallback).
 */
(function (global) {
    const CHANNEL_NAME = 'sieglings-catalog-publish';
    const STORAGE_KEY = 'sieglingsCatalogVersion';

    function readStoredVersion() {
        try {
            return Number(global.localStorage.getItem(STORAGE_KEY)) || 0;
        } catch (error) {
            return 0;
        }
    }

    function notifyCatalogPublished(catalogVersion) {
        const version = Number(catalogVersion);
        const resolved = Number.isFinite(version) && version > 0 ? version : Date.now();
        try {
            global.localStorage.setItem(STORAGE_KEY, String(resolved));
        } catch (error) {
            // Ignore storage failures; BroadcastChannel may still work.
        }
        try {
            const channel = new BroadcastChannel(CHANNEL_NAME);
            channel.postMessage({ catalogVersion: resolved });
            channel.close();
        } catch (error) {
            // BroadcastChannel not available in very old browsers.
        }
    }

    function onCatalogPublished(callback) {
        if (typeof callback !== 'function') {
            return () => {};
        }
        let channel = null;
        try {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = (event) => {
                const version = Number(event?.data?.catalogVersion);
                callback(Number.isFinite(version) ? version : readStoredVersion());
            };
        } catch (error) {
            // Ignore.
        }
        const onStorage = (event) => {
            if (event.key !== STORAGE_KEY) return;
            const version = Number(event.newValue);
            callback(Number.isFinite(version) ? version : 0);
        };
        global.addEventListener('storage', onStorage);
        return () => {
            if (channel) {
                channel.close();
                channel = null;
            }
            global.removeEventListener('storage', onStorage);
        };
    }

    global.SieglingsCatalogSync = {
        notifyCatalogPublished,
        onCatalogPublished,
        readStoredVersion
    };
})(typeof window !== 'undefined' ? window : globalThis);
