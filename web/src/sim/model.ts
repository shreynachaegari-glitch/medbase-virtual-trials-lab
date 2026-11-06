import { hbA1cLogHazard, referenceHbA1c, type TreatmentArm } from "./params";

export interface PatientInput {
    baselineHbA1c: number;
    driftRate: number;
    diabetesDuration: number;
}

export interface ModelConstants {
    baselineMicroHazard: number;
    baselineMiHazard: number;
    durationHazardPerYear: number;
}

export interface YearPoint {
    year: number;
    hbA1c: number;
    /** UKPDS 35 expressed risk against *updated mean* HbA1c, so the model tracks the running mean. */
    updatedMeanHbA1c: number;
    cumulativeMicro: number;
    cumulativeMi: number;
}

/** HbA1c is bounded to a physiologically sane window so extreme drift cannot run away. */
const HBA1C_FLOOR = 4.0;
const HBA1C_CEILING = 16.0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A 1-point *reduction* cuts risk by r, so a 1-point rise multiplies it by 1/(1-r). */
export const logHazardPer1Pct = (riskReductionPer1Pct: number) =>
    Math.log(1 / (1 - riskReductionPer1Pct));

export const betaMicro = logHazardPer1Pct(hbA1cLogHazard.microvascular.riskReductionPer1Pct);
export const betaMi = logHazardPer1Pct(hbA1cLogHazard.myocardialInfarction.riskReductionPer1Pct);

export const hbA1cAtYear = (patient: PatientInput, arm: TreatmentArm, year: number): number =>
    clamp(
        patient.baselineHbA1c + arm.hbA1cShift + patient.driftRate * arm.driftMultiplier * year,
        HBA1C_FLOOR,
        HBA1C_CEILING,
    );

export const simulatePatient = (
    patient: PatientInput,
    arm: TreatmentArm,
    constants: ModelConstants,
    horizonYears: number,
): YearPoint[] => {
    const points: YearPoint[] = [];
    let hbA1cSum = 0;
    let microSurvival = 1;
    let miSurvival = 1;

    for (let year = 0; year <= horizonYears; year++) {
        const hbA1c = hbA1cAtYear(patient, arm, year);
        hbA1cSum += hbA1c;
        const updatedMeanHbA1c = hbA1cSum / (year + 1);
        const excess = updatedMeanHbA1c - referenceHbA1c;
        const durationFactor =
            1 + constants.durationHazardPerYear * (patient.diabetesDuration + year);

        if (year > 0) {
            const microHazard = clamp(
                constants.baselineMicroHazard * Math.exp(betaMicro * excess) * durationFactor,
                0,
                0.95,
            );
            const miHazard = clamp(
                constants.baselineMiHazard * Math.exp(betaMi * excess) * durationFactor,
                0,
                0.95,
            );
            microSurvival *= 1 - microHazard;
            miSurvival *= 1 - miHazard;
        }

        points.push({
            year,
            hbA1c,
            updatedMeanHbA1c,
            cumulativeMicro: 1 - microSurvival,
            cumulativeMi: 1 - miSurvival,
        });
    }

    return points;
};
