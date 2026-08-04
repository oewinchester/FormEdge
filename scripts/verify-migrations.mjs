import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "..");

export async function verifyMigrationIntegrity(rootDir = defaultRoot) {
  const rootPath = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const migrationDir = resolve(rootPath, "drizzle");
  const metaDir = resolve(migrationDir, "meta");
  const journal = JSON.parse(await readFile(resolve(metaDir, "_journal.json"), "utf8"));
  const errors = [];

  if (journal.dialect !== "sqlite") errors.push("journal dialect must be sqlite");
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    errors.push("journal must contain at least one migration entry");
  }

  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const seenTags = new Set();
  let previousWhen = -Infinity;
  for (const [position, entry] of entries.entries()) {
    const prefix = String(position).padStart(4, "0");
    if (entry.idx !== position) errors.push(`journal idx ${entry.idx} is out of sequence at position ${position}`);
    if (typeof entry.tag !== "string" || !entry.tag.startsWith(`${prefix}_`)) {
      errors.push(`journal entry ${position} must use the ${prefix}_ tag prefix`);
    }
    if (seenTags.has(entry.tag)) errors.push(`duplicate migration tag: ${entry.tag}`);
    seenTags.add(entry.tag);
    if (!Number.isFinite(entry.when) || entry.when < previousWhen) {
      errors.push(`journal timestamp is not monotonic at ${entry.tag ?? position}`);
    }
    previousWhen = entry.when;
  }

  const migrationNames = await readdir(migrationDir);
  const metaNames = await readdir(metaDir);
  const sqlNames = migrationNames.filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const snapshotNames = metaNames.filter((name) => /^\d{4}_snapshot\.json$/.test(name)).sort();
  const expectedSqlNames = entries.map((entry) => `${entry.tag}.sql`).sort();
  const expectedSnapshotNames = entries.map((entry) => `${String(entry.idx).padStart(4, "0")}_snapshot.json`).sort();

  compareFileSets("SQL migration", expectedSqlNames, sqlNames, errors);
  compareFileSets("schema snapshot", expectedSnapshotNames, snapshotNames, errors);

  const digest = createHash("sha256");
  for (const entry of entries) {
    const sqlName = `${entry.tag}.sql`;
    const snapshotName = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
    try {
      const sql = await readFile(resolve(migrationDir, sqlName), "utf8");
      if (!sql.trim()) errors.push(`${sqlName} is empty`);
      digest.update(sqlName).update("\0").update(sql).update("\0");
    } catch {
      // The set comparison above reports the missing path without exposing content.
    }
    try {
      const snapshot = await readFile(resolve(metaDir, snapshotName), "utf8");
      JSON.parse(snapshot);
      digest.update(snapshotName).update("\0").update(snapshot).update("\0");
    } catch (error) {
      if (snapshotNames.includes(snapshotName)) {
        errors.push(`${snapshotName} is not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Migration integrity failed:\n- ${errors.join("\n- ")}`);
  }

  return { dialect: journal.dialect, count: entries.length, sha256: digest.digest("hex") };
}

function compareFileSets(label, expected, actual, errors) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  for (const name of expected) if (!actualSet.has(name)) errors.push(`missing ${label}: ${name}`);
  for (const name of actual) if (!expectedSet.has(name)) errors.push(`untracked ${label}: ${name}`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  verifyMigrationIntegrity()
    .then((report) => console.log(`Migration integrity: ${report.count} entries · sha256 ${report.sha256}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
