/**
 * .env parsing for ~/.claude/channels/lark/.env.
 *
 * Pure and dependency-free so it can be unit-tested. The previous inline
 * regex (`/^(\w+)=(.*)$/`) mis-parsed three common cases, all of which
 * surface as an opaque "invalid app secret" from Lark:
 *   - CRLF line endings left a trailing \r inside the secret
 *   - quoted values kept their quotes
 *   - `export FOO=bar` was skipped entirely
 */

const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/

function unquote(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}

/** Parse the contents of a dotenv file into a plain key/value record. */
export function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = ASSIGNMENT.exec(line)
    if (!m) continue
    out[m[1]] = unquote(m[2].trim())
  }
  return out
}
