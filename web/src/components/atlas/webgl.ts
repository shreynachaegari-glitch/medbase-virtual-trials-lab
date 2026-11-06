/** Whether 3D can run here at all. The pages stay fully usable as text when it can't. */
export const canUseWebGL = (): boolean => {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
        return false;
    }
};
