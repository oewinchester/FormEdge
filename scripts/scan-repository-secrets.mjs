import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "..");
const binaryExtensions = new Set([
  ".avif", ".gif", ".glb", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".ttf", ".webp", ".woff", ".woff2", ".zip",
]);
const secretRules = [
  { id: "github-fine-grained-pat", expression: /github_pat_[A-Za-z0-9_]{50,}/g },
  { id: "github-classic-token", expression: /gh[oprsu]_[A-Za-z0-9]{30,}/g },
  { id: "private-key", expression: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { id: "aws-access-key", expression: /AKIA[0-9A-Z]{16}/g },
  { id: "slack-token", expression: /xox[baprs]-[A-Za-z0-9-]{20,}/g },
  { id: "stripe-live-secret", expression: /sk_live_[A-Za-z0-9]{20,}/g },
  { id: "assigned-high-entropy-secret", expression: /(?:TOKEN|SECRET|PRIVATE_KEY)\s*[:=]\s*["']?(?=[A-Za-z0-9+/_=-]{32,}["']?)(?=[A-Za-z0-9+/_=-]*[a-z])(?=[A-Za-z0-9+/_=-]*\d)[A-Za-z0-9+/_=-]{32,}["']?/gi },
];

export function findHighConfidenceSecrets(text) {
  return secretRules.filter(({ expression }) => new RegExp(expression.source, expression.flags).test(text)).map(({ id }) => id);
}

export async function scanRepositoryForSecrets(rootDir = defaultRoot) {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  const paths = listed.split("\0").filter(Boolean);
  const findings = [];
  for (const relativePath of paths) {
    if (binaryExtensions.has(extname(relativePath).toLowerCase())) continue;
    const absolutePath = resolve(rootDir, relativePath);
    if (!absolutePath.startsWith(`${resolve(rootDir)}${sep}`)) continue;
    const stats = await lstat(absolutePath);
    if (!stats.isFile() || stats.size > 2 * 1024 * 1024) continue;
    const contents = await readFile(absolutePath, "utf8");
    if (contents.includes("\0")) continue;
    for (const rule of findHighConfidenceSecrets(contents)) findings.push({ path: relativePath, rule });
  }
  return { scannedFiles: paths.length, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  scanRepositoryForSecrets()
    .then((report) => {
      if (report.findings.length > 0) {
        throw new Error(`Repository secret scan failed:\n${report.findings.map(({ path, rule }) => `- ${path}: ${rule}`).join("\n")}`);
      }
      console.log(`Repository secret scan: ${report.scannedFiles} files · no high-confidence secret patterns found.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
