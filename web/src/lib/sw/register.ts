/**
 * Registers the offline cache (public/sw.js) on the static build only. A same-origin server, dev mode and
 * tests leave it off, so it can never stand between the page and a live API.
 */
export const registerOfflineCache = (): void => {
    if (!import.meta.env.PROD || !import.meta.env.VITE_LANDING || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); // the site works the same without it
    });
};
