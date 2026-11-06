/** Round axis ticks across a range: steps of 1, 2 or 5 times a power of ten. */
export const niceTicks = (min: number, max: number, count = 5): number[] => {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const start = Math.ceil(min / step) * step;
    const out: number[] = [];
    for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
    return out;
};
