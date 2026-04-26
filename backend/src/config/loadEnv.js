import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPaths = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../../pqc-chat-ui/.env"),
];

const stripWrappingQuotes = (value) => {
  if (!value) return value;
  const starts = value.startsWith('"') || value.startsWith("'");
  const ends = value.endsWith('"') || value.endsWith("'");
  if (starts && ends && value.length >= 2) return value.slice(1, -1);
  return value;
};

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator <= 0) return null;

  const key = trimmed.slice(0, separator).trim();
  const rawValue = trimmed.slice(separator + 1).trim();
  const value = stripWrappingQuotes(rawValue).replace(/\\n/g, "\n");

  if (!key) return null;
  return { key, value };
};

envPaths.forEach((envPath) => {
  if (!fs.existsSync(envPath)) return;

  const file = fs.readFileSync(envPath, "utf8");
  file.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    if (process.env[parsed.key] == null) {
      process.env[parsed.key] = parsed.value;
    }
  });
});
