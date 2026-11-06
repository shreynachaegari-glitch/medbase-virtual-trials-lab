import { createContext, useContext } from "react";
import type { PassMarks } from "./types";

/**
 * Facts about the calibration that simulated results don't carry themselves. Every result panel
 * reads them from here, so an unconverged chain is flagged next to every result.
 */
export interface ChainStatus {
    converged: boolean | null;
    maxSplitRhat: number | null;
    lengthOverTau: number | null;
    passMarks: PassMarks | null;
}

export const NO_CHAIN_STATUS: ChainStatus = { converged: null, maxSplitRhat: null, lengthOverTau: null, passMarks: null };

export const ChainContext = createContext<ChainStatus>(NO_CHAIN_STATUS);

export const useChainStatus = (): ChainStatus => useContext(ChainContext);
