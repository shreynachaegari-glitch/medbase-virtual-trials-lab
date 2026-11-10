import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { titleFor } from "@/lib/pageTitle";

/** One tab title per page, so a visitor with several tabs open can tell them apart. */
const TitleManager = () => {
    const { pathname } = useLocation();
    useEffect(() => {
        const title = titleFor(pathname);
        if (title) document.title = title;
    }, [pathname]);
    return null;
};

export default TitleManager;
