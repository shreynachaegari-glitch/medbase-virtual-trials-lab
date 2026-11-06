/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Address of the AI proxy. It holds no secret: only the proxy has a key. */
    readonly VITE_LLM_PROXY?: string;
    /** The route a static build opens at its root. */
    readonly VITE_LANDING?: string;
}
