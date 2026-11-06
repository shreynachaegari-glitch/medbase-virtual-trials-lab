import { asArray, asNumber, asRecord, asString, asStrings, at, fetchJson, qs, SourceError } from "./http";
import type { Trial, TrialPage } from "./types";

const CTGOV = "https://clinicaltrials.gov/api/v2/studies";

export const trialStatuses = [
    { id: "RECRUITING", label: "Recruiting" },
    { id: "NOT_YET_RECRUITING", label: "Not yet recruiting" },
    { id: "ACTIVE_NOT_RECRUITING", label: "Active, not recruiting" },
    { id: "ENROLLING_BY_INVITATION", label: "Enrolling by invitation" },
    { id: "COMPLETED", label: "Completed" },
    { id: "TERMINATED", label: "Terminated" },
    { id: "SUSPENDED", label: "Suspended" },
    { id: "WITHDRAWN", label: "Withdrawn" },
    { id: "UNKNOWN", label: "Unknown status" },
] as const;

export const trialPhases = [
    { id: "EARLY_PHASE1", label: "Early phase 1" },
    { id: "PHASE1", label: "Phase 1" },
    { id: "PHASE2", label: "Phase 2" },
    { id: "PHASE3", label: "Phase 3" },
    { id: "PHASE4", label: "Phase 4" },
] as const;

export type TrialStatusFilter = "active" | "recruiting" | "completed" | "any";
export type TrialPhaseFilter = "any" | (typeof trialPhases)[number]["id"];
export type TrialSort = "relevance" | "updated";

const statusFilter: Record<TrialStatusFilter, string | undefined> = {
    recruiting: "RECRUITING",
    active: "RECRUITING,NOT_YET_RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION",
    completed: "COMPLETED",
    any: undefined,
};

/** Only the pieces the table shows, so a page of twenty studies is kilobytes, not megabytes. */
const FIELDS = [
    "NCTId",
    "BriefTitle",
    "OverallStatus",
    "Phase",
    "StudyType",
    "EnrollmentCount",
    "LeadSponsorName",
    "StartDate",
    "PrimaryCompletionDate",
    "Condition",
    "InterventionName",
    "LocationCountry",
].join(",");

export interface TrialQuery {
    condition: string;
    term?: string;
    status?: TrialStatusFilter;
    phase?: TrialPhaseFilter;
    sort?: TrialSort;
    pageSize?: number;
}

export const trialsSearchUrl = (q: TrialQuery, withFields = true) =>
    `${CTGOV}?${qs({
        "query.cond": q.condition,
        "query.term": q.term,
        "filter.overallStatus": statusFilter[q.status ?? "any"],
        "filter.advanced": q.phase && q.phase !== "any" ? `AREA[Phase]${q.phase}` : undefined,
        sort: q.sort === "updated" ? "LastUpdatePostDate:desc" : undefined,
        pageSize: q.pageSize ?? 20,
        countTotal: "true",
        fields: withFields ? FIELDS : undefined,
    })}`;

const unique = (xs: string[]) => [...new Set(xs)];

export const parseTrials = (json: unknown): TrialPage => {
    const root = asRecord(json);
    if (!root) throw new SourceError("parse", "ClinicalTrials.gov returned an empty response.");

    const trials = asArray(root.studies).flatMap((raw): Trial[] => {
        const p = at(raw, "protocolSection");
        const nctId = asString(at(p, "identificationModule.nctId"));
        if (!nctId) return [];
        const locations = asArray(at(p, "contactsLocationsModule.locations")).map(asRecord);
        return [
            {
                nctId,
                title:
                    asString(at(p, "identificationModule.briefTitle")) ??
                    asString(at(p, "identificationModule.officialTitle")) ??
                    nctId,
                status: asString(at(p, "statusModule.overallStatus")),
                phases: asStrings(at(p, "designModule.phases")),
                studyType: asString(at(p, "designModule.studyType")),
                enrollment: asNumber(at(p, "designModule.enrollmentInfo.count")),
                sponsor: asString(at(p, "sponsorCollaboratorsModule.leadSponsor.name")),
                startDate: asString(at(p, "statusModule.startDateStruct.date")),
                primaryCompletion: asString(at(p, "statusModule.primaryCompletionDateStruct.date")),
                conditions: asStrings(at(p, "conditionsModule.conditions")),
                interventions: unique(
                    asArray(at(p, "armsInterventionsModule.interventions"))
                        .map((i) => asString(asRecord(i)?.name))
                        .filter((s): s is string => Boolean(s)),
                ),
                countries: unique(
                    locations.map((l) => asString(l?.country)).filter((s): s is string => Boolean(s)),
                ),
                siteCount: locations.length || undefined,
            },
        ];
    });

    return { total: asNumber(root.totalCount) ?? trials.length, trials };
};

export const searchTrials = async (q: TrialQuery, signal?: AbortSignal): Promise<TrialPage> => {
    try {
        return parseTrials(await fetchJson(trialsSearchUrl(q), { signal }));
    } catch (e) {
        // If the API ever renames a field piece, a 400 on the slim request should not take the
        // panel down: the full record carries the same data, only heavier.
        if (e instanceof SourceError && e.status === 400) {
            return parseTrials(await fetchJson(trialsSearchUrl(q, false), { signal }));
        }
        throw e;
    }
};

export const trialsWebUrl = (q: TrialQuery) =>
    `https://clinicaltrials.gov/search?${qs({
        cond: q.condition,
        term: q.term,
        aggFilters: q.status === "recruiting" ? "status:rec" : q.status === "completed" ? "status:com" : undefined,
    })}`;

export const trialUrl = (nctId: string) => `https://clinicaltrials.gov/study/${nctId}`;

const STATUS_LABEL = Object.fromEntries(trialStatuses.map((s) => [s.id, s.label]));
const PHASE_LABEL: Record<string, string> = {
    ...Object.fromEntries(trialPhases.map((p) => [p.id, p.label])),
    NA: "Not applicable",
};

export const statusLabel = (s?: string) => (s ? (STATUS_LABEL[s] ?? s) : "—");
export const phaseLabel = (phases: string[]) =>
    phases.length ? phases.map((p) => PHASE_LABEL[p] ?? p).join(" / ") : "—";
