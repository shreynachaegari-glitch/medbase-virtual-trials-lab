export const DEFAULT_TITLE = "MedBase — Virtual Medical Research Laboratory";

/** Pages that name themselves more precisely (Trials, Lab) set their own title after this runs. */
const TITLES: [RegExp, string][] = [
    [/^\/(home|index\.html)?$/, "MedBase — AI virtual trials for type 2 diabetes"],
    [/^\/copilot/, "AI Copilot — MedBase"],
    [/^\/anatomy/, "Anatomy explorer — MedBase"],
    [/^\/evidence/, "Evidence — MedBase"],
    [/^\/methods/, "Methods — MedBase"],
    [/^\/funding/, "Funding — MedBase"],
    [/^\/conditions\//, "Condition record — MedBase"],
];

export const titleFor = (pathname: string): string | null => {
    if (/^\/(trials|lab)/.test(pathname)) return null;
    return TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Page not found — MedBase";
};
