// Runs the copilot's vector database under Node: PostgreSQL and pgvector, from the build the browser loads.
// Called by scripts/eval_vector_db.py with a JSON file of question embeddings. Prints scores for each question.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const { titles, dimensions, vectors } = JSON.parse(readFileSync(new URL("../public/engine/note_vectors.json", import.meta.url), "utf8"));
const bytes = Buffer.from(vectors, "base64");
const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);

const startedAt = performance.now();
const db = new PGlite({ extensions: { vector } });
await db.waitReady;
await db.exec(`CREATE EXTENSION IF NOT EXISTS vector; CREATE TABLE notes (title text PRIMARY KEY, embedding vector(${dimensions}));`);
await db.transaction(async (tx) => {
  for (const [row, title] of titles.entries()) {
    await tx.query("INSERT INTO notes (title, embedding) VALUES ($1, $2)", [title, `[${floats.subarray(row * dimensions, (row + 1) * dimensions).join(",")}]`]);
  }
});
const loadMs = performance.now() - startedAt;

const queries = JSON.parse(readFileSync(process.argv[2], "utf8"));
const scores = [];
const queryMs = [];
for (const embedding of queries.vectors) {
  const began = performance.now();
  const { rows } = await db.query("SELECT title, 1 - (embedding <=> $1) AS score FROM notes ORDER BY embedding <=> $1", [`[${embedding.join(",")}]`]);
  queryMs.push(performance.now() - began);
  scores.push(Object.fromEntries(rows.map((row) => [row.title, row.score])));
}
const version = (await db.query("SELECT version()")).rows[0].version.split(" on ")[0];
const pgvector = (await db.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).rows[0].extversion;
console.log(JSON.stringify({ version, pgvector, notes: titles.length, load_ms: loadMs, query_ms: queryMs, scores }));
await db.close();
