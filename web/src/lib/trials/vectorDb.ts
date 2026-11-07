/**
 * The copilot's vector database: PostgreSQL with pgvector, compiled to WebAssembly by PGlite, running in the
 * visitor's browser. It needs no server and no account. If it can't load, the engine does the same cosine
 * calculation in numpy, so an answer never depends on it.
 */
import type { PGlite } from "@electric-sql/pglite";

interface SavedVectors {
    titles: string[];
    dimensions: number;
    /** Base64 of little-endian 32-bit floats, one row per note. */
    vectors: string;
}

export interface NoteScores {
    /** Cosine similarity for every note. */
    scores: Record<string, number>;
    /** How long the SQL query itself took, measured here. */
    query_ms: number;
}

const decode = ({ vectors, titles, dimensions }: SavedVectors): { title: string; embedding: string }[] => {
    const bytes = Uint8Array.from(atob(vectors), (c) => c.charCodeAt(0));
    const floats = new Float32Array(bytes.buffer);
    return titles.map((title, row) => ({ title, embedding: `[${floats.subarray(row * dimensions, (row + 1) * dimensions).join(",")}]` }));
};

const open = async (engineUrl: string): Promise<PGlite> => {
    const [{ PGlite: Database }, { vector }] = await Promise.all([import("@electric-sql/pglite"), import("@electric-sql/pglite-pgvector")]);
    const response = await fetch(`${engineUrl}note_vectors.json`);
    if (!response.ok) throw new Error(`note vectors answered ${response.status}`);
    const saved = (await response.json()) as SavedVectors;
    const db = new Database({ extensions: { vector } });
    await db.waitReady;
    await db.exec(`CREATE EXTENSION IF NOT EXISTS vector; CREATE TABLE notes (title text PRIMARY KEY, embedding vector(${saved.dimensions}));`);
    await db.transaction(async (tx) => {
        for (const { title, embedding } of decode(saved)) await tx.query("INSERT INTO notes (title, embedding) VALUES ($1, $2)", [title, embedding]);
    });
    return db;
};

let opening: Promise<PGlite> | null = null;

/** Starts the database once. A failure is remembered, so the fallback answers without trying again on every question. */
export const openVectorDb = (engineUrl: string): Promise<PGlite> => {
    opening ??= open(engineUrl);
    return opening;
};

export const scoreNotes = async (engineUrl: string, embedding: string): Promise<NoteScores> => {
    const db = await openVectorDb(engineUrl);
    const startedAt = performance.now();
    const { rows } = await db.query<{ title: string; score: number }>("SELECT title, 1 - (embedding <=> $1) AS score FROM notes ORDER BY embedding <=> $1", [embedding]);
    return { scores: Object.fromEntries(rows.map((row) => [row.title, row.score])), query_ms: performance.now() - startedAt };
};
