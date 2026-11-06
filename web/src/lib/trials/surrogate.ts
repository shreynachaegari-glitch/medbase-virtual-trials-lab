/**
 * Runs the neural surrogate on the main thread, with no Pyodide, so sliders answer instantly. It reproduces
 * scikit-learn's MLPRegressor forward pass for the file scripts/train_surrogate.py writes. It approximates the
 * simulator, not reality, and its inputs describe a study population, never one person.
 */
export interface SurrogateNet {
    drugs: string[];
    dose_ranges: Record<string, [number, number]>;
    features: string[];
    mean_x: number[];
    std_x: number[];
    mean_y: number[];
    std_y: number[];
    /** weights[layer][input][output], as in scikit-learn's coefs_. */
    weights: number[][][];
    biases: number[][];
    activation: string;
    outputs: string[];
    evaluation: Record<string, number>;
    ranges: { weeks: [number, number]; target_a1c: [number, number]; egfr_bands: [number, number][] };
    notice: string;
}

export interface SurrogateInput {
    drug: string;
    mg: number;
    weeks: number;
    targetA1c: number;
    egfrLow: number;
    egfrHigh: number;
}

export const isSurrogate = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) return false;
    const net = value as Partial<SurrogateNet>;
    return (
        Array.isArray(net.drugs) && Array.isArray(net.features) && Array.isArray(net.weights) && Array.isArray(net.biases) &&
        net.weights.length === net.biases.length && net.weights.length > 0 && net.activation === "tanh" &&
        Array.isArray(net.outputs) && typeof net.notice === "string" && typeof net.evaluation === "object" && typeof net.ranges === "object" &&
        net.features.length === net.mean_x?.length && net.features.length === net.std_x?.length && net.outputs.length === net.mean_y?.length
    );
};

/** Where a dose sits on its drug's log scale: 0 at the lowest modelled dose and 1 at the highest. */
export const dosePosition = (net: SurrogateNet, drug: string, mg: number): number => {
    const [low, high] = net.dose_ranges[drug];
    return (Math.log(mg) - Math.log(low)) / (Math.log(high) - Math.log(low));
};

export const doseAt = (net: SurrogateNet, drug: string, position: number): number => {
    const [low, high] = net.dose_ranges[drug];
    return Math.exp(Math.log(low) + position * (Math.log(high) - Math.log(low)));
};

const featureValue = (name: string, net: SurrogateNet, input: SurrogateInput): number => {
    if (net.drugs.includes(name)) return name === input.drug ? 1 : 0;
    switch (name) {
        case "log_dose_position":
            return dosePosition(net, input.drug, input.mg);
        case "weeks":
            return input.weeks;
        case "target_a1c":
            return input.targetA1c;
        case "egfr_low":
            return input.egfrLow;
        case "egfr_high":
            return input.egfrHigh;
        default:
            throw new Error(`unknown surrogate feature: ${name}`);
    }
};

/** One forward pass. Tanh on hidden layers and identity on the last, as MLPRegressor does. */
export const forward = (net: Pick<SurrogateNet, "weights" | "biases">, inputs: readonly number[]): number[] => {
    let activations: readonly number[] = inputs;
    net.weights.forEach((weights, layer) => {
        const size = net.biases[layer].length;
        const next = new Array<number>(size).fill(0);
        for (let out = 0; out < size; out += 1) {
            let sum = net.biases[layer][out];
            for (let i = 0; i < activations.length; i += 1) sum += activations[i] * weights[i][out];
            next[out] = layer === net.weights.length - 1 ? sum : Math.tanh(sum);
        }
        activations = next;
    });
    return [...activations];
};

export const predict = (net: SurrogateNet, input: SurrogateInput): Record<string, number> => {
    const scaled = net.features.map((name, i) => (featureValue(name, net, input) - net.mean_x[i]) / net.std_x[i]);
    const out = forward(net, scaled);
    return Object.fromEntries(net.outputs.map((name, i) => [name, out[i] * net.std_y[i] + net.mean_y[i]]));
};

const CURVE_POINTS = 32;

/** The dose-response curve for one setting of everything else, on the log dose scale. */
export const doseResponse = (net: SurrogateNet, base: Omit<SurrogateInput, "mg">, output: string): { position: number; mg: number; value: number }[] =>
    Array.from({ length: CURVE_POINTS }, (_, i) => {
        const position = i / (CURVE_POINTS - 1);
        const mg = doseAt(net, base.drug, position);
        return { position, mg, value: predict(net, { ...base, mg })[output] };
    });
