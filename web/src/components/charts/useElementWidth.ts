import { useEffect, useRef, useState } from "react";

/**
 * Charts draw in a viewBox whose width matches the rendered CSS width, so one SVG unit is
 * one CSS pixel and axis type stays at its true size instead of shrinking with the container.
 */
export const useElementWidth = <T extends HTMLElement>(fallback = 760) => {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(fallback);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width;
            if (w && w > 0) setWidth(w);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return { ref, width };
};
