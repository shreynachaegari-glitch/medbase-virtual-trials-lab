import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * BrowserRouter keeps the old scroll position across navigations and ignores URL hashes, so a
 * footer link would land at the bottom of the next page and "/evidence#databases" would not
 * move at all. Keyed on pathname and hash only: the Lab rewrites its query string as you work,
 * and that must never jump the page.
 */
const ScrollManager = () => {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (hash) {
            // The target may belong to a lazily loaded page, so give it a frame to mount.
            const id = decodeURIComponent(hash.slice(1));
            let tries = 0;
            const find = () => {
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ block: "start" });
                else if (tries++ < 20) requestAnimationFrame(find);
            };
            find();
            return;
        }
        window.scrollTo(0, 0);
    }, [pathname, hash]);

    return null;
};

export default ScrollManager;
