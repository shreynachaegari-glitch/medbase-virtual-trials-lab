import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface Props {
    children: ReactNode;
    /** Index in a group; drives the stagger without a parent orchestrator. */
    index?: number;
    className?: string;
    as?: "div" | "section" | "li";
}

/**
 * Reveals once the element has entered *or already passed* the viewport.
 *
 * `whileInView` alone is not safe here: if the reader jumps past a section — End key,
 * an anchor link, a restored scroll position — the observer never reports an entry and the
 * content stays invisible for good. Checking `top < innerHeight` on mount and on scroll
 * catches the passed-over case too, so content can never be stranded at opacity 0.
 */
export const Reveal = ({ children, index = 0, className, as = "div" }: Props) => {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (shown) return;

        const check = () => {
            const el = ref.current;
            if (!el) return;
            if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
                setShown(true);
            }
        };

        check();
        window.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check, { passive: true });
        return () => {
            window.removeEventListener("scroll", check);
            window.removeEventListener("resize", check);
        };
    }, [shown]);

    const Component = motion[as];

    return (
        <Component
            ref={ref as never}
            className={className}
            initial={{ opacity: 0, transform: reduce ? "none" : "translateY(12px)" }}
            animate={
                shown
                    ? { opacity: 1, transform: "translateY(0px)" }
                    : { opacity: 0, transform: reduce ? "none" : "translateY(12px)" }
            }
            transition={{
                duration: 0.45,
                ease: [0.23, 1, 0.32, 1],
                delay: reduce ? 0 : Math.min(index, 5) * 0.06,
            }}
        >
            {children}
        </Component>
    );
};

export default Reveal;
