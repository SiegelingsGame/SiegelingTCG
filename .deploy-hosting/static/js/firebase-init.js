import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

const firebaseConfig = window.SIEGLINGS_CONFIG?.firebase;

if (!firebaseConfig) {
    window.SIEGLINGS_FIREBASE = {
        initialized: false,
        app: null,
        analytics: null
    };
} else {
    const app = initializeApp(firebaseConfig);

    window.SIEGLINGS_FIREBASE = {
        initialized: true,
        app,
        analytics: null
    };

    analyticsIsSupported()
        .then((supported) => {
            if (!supported) {
                return;
            }

            window.SIEGLINGS_FIREBASE.analytics = getAnalytics(app);
        })
        .catch((error) => {
            console.warn("Firebase Analytics was not initialized.", error);
        });
}
