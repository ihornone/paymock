#!/usr/bin/env tsx

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const SCAN_ROOTS = ['src', 'scripts'];

const SCAN_EXTENSIONS = ['.ts', '.tsx'];

const EXCLUDED_PATHS: Array<{ path: string; reason: string }> = [
  { path: 'tests/', reason: 'test fixtures and assertions are not production SQL' },
  { path: 'src/server/db/schema.ts', reason: 'table definitions, not executable statements' },
  { path: 'scripts/lint-sql.ts', reason: 'the linter itself contains SQL detection patterns' },
];

const ALLOWED_IDENTIFIERS: Record<string, string> = {
};

const WHITELIST: Array<{
  path: string;
  line?: number;
  pattern?: RegExp;
  reason: string;
}> = [
  {
    path: 'scripts/migrate-security.ts',
    pattern: /SELECT \* FROM \$\{table\}/,
    reason:
      'the table name comes from sqlite_master — the database own catalog — and is never operator input; a table name cannot be a bound parameter in SQLite',
  },
  {
    path: 'scripts/migrate-security.ts',
    pattern: /id IN \(\$\{/,
    reason:
      'only the number of "?" placeholders is interpolated (the ids.map(() => "?") chain); the id values themselves are bound as query parameters',
  },

];

type StringKind = 'single' | 'double' | 'template';

interface StringSpan {
  start: number;
  end: number;
  kind: StringKind;
  text: string;
  interpolations: Array<{ start: number; end: number; expression: string }>;
}

interface ScanResult {
  content: string;
  structure: string;
  spans: StringSpan[];
}

function isRegexStart(source: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return true;

  const prev = source[i];
  if ('(,=:[!&|?{};'.includes(prev)) return true;

  const wordMatch = source.slice(0, i + 1).match(/([A-Za-z_$][\w$]*)$/);
  if (wordMatch) {
    const word = wordMatch[1];
    if (
      [
        'return',
        'case',
        'typeof',
        'instanceof',
        'in',
        'of',
        'new',
        'do',
        'else',
        'yield',
        'await',
        'void',
        'delete',
      ].includes(word)
    ) {
      return true;
    }
  }

  return false;
}

function scan(source: string): ScanResult {
  const content = source.split('');
  const structure = source.split('');
  const spans: StringSpan[] = [];

  const blank = (index: number, keepNewlines: boolean): void => {
    if (keepNewlines && content[index] === '\n') return;
    content[index] = ' ';
    structure[index] = ' ';
  };

  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : '';

    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') {
        blank(i, true);
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      blank(i, true);
      blank(i + 1, true);
      i += 2;
      while (i < n) {
        if (source[i] === '*' && source[i + 1] === '/') {
          blank(i, true);
          blank(i + 1, true);
          i += 2;
          break;
        }
        blank(i, true);
        i += 1;
      }
      continue;
    }

    if (ch === '/' && isRegexStart(source, i)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const c = source[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          j += 1;
          closed = true;
          break;
        } else if (c === '\n') break;
        j += 1;
      }
      if (!closed) j = n;
      while (i < j) {
        blank(i, true);
        i += 1;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const kind: StringKind = ch === '`' ? 'template' : ch === '"' ? 'double' : 'single';
      const start = i;
      i += 1;

      let text = '';
      const interpolations: StringSpan['interpolations'] = [];

      while (i < n) {
        const c = source[i];

        if (c === '\\') {
          text += source[i + 1] ?? '';
          i += 2;
          continue;
        }

        if (kind !== 'template' && c === ch) {
          i += 1;
          break;
        }

        if (kind === 'template' && c === '`') {
          i += 1;
          break;
        }

        if (kind === 'template' && c === '$' && source[i + 1] === '{') {
          const exprStart = i + 2;
          let depth = 1;
          let j = exprStart;

          while (j < n && depth > 0) {
            const ec = source[j];
            if (ec === '"' || ec === "'" || ec === '`') {
              const quote = ec;
              j += 1;
              while (j < n) {
                if (source[j] === '\\') {
                  j += 2;
                  continue;
                }
                if (source[j] === quote) break;
                j += 1;
              }
              j += 1;
              continue;
            }
            if (ec === '{') depth += 1;
            if (ec === '}') {
              depth -= 1;
              if (depth === 0) break;
            }
            j += 1;
          }

          const expression = source.slice(exprStart, j);
          interpolations.push({ start: exprStart, end: j, expression });
          text += '${' + expression + '}';
          i = j + 1;
          continue;
        }

        text += c;
        i += 1;
      }

      spans.push({ start, end: i, kind, text, interpolations });

      for (let k = start; k < i; k += 1) {
        if (source[k] === '\n') continue;
        structure[k] = ' ';
      }
      structure[start] = ch;

      continue;
    }

    i += 1;
  }

  return { content: content.join(''), structure: structure.join(''), spans };
}

const SQL_PATTERNS: RegExp[] = [
  /\bSELECT\b[\s\S]{0,400}?\bFROM\s+[\w"(`$]/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+[\w."`]+[\s\S]{0,80}?\bSET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUNION\s+(?:ALL\s+)?SELECT\b/i,
  /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX)\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bMERGE\s+INTO\b/i,
];

function looksLikeSql(text: string): boolean {
  return SQL_PATTERNS.some((pattern) => pattern.test(text));
}

function isBareIdentifier(expression: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(expression.trim());
}

function precedingTag(content: string, index: number): { tag: string; text: string } {
  const before = content.slice(0, index).replace(/\(\s*$/, '');
  const match = before.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/);
  return { tag: match ? match[1] : '', text: match ? match[0] : '' };
}

type RuleId =
  | 'SQL_TEMPLATE'
  | 'SQL_TAG'
  | 'SQL_RAW'
  | 'SQL_PREPARE'
  | 'SQL_EXEC'
  | 'SQL_CONCAT';

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: RuleId;
  message: string;
  snippet: string;
  allowedBy?: string;
}

const SQL_KEYWORDS = /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|ORDER\s+BY|LIMIT|OFFSET|VALUES|SET)\b/i;

function analyseFile(absolutePath: string, relativePath: string): Violation[] {
  const source = readFileSync(absolutePath, 'utf-8');
  const { content, structure, spans } = scan(source);
  const violations: Violation[] = [];

  const lineOf = (index: number): number => {
    let line = 1;
    for (let i = 0; i < index && i < source.length; i += 1) {
      if (source[i] === '\n') line += 1;
    }
    return line;
  };

  const columnOf = (index: number): number => {
    const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    return index - lineStart + 1;
  };

  const snippetAt = (index: number): string => {
    const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const lineEnd = source.indexOf('\n', index);
    const end = lineEnd === -1 ? source.length : lineEnd;
    return source.slice(lineStart, end).trim();
  };

  const push = (
    index: number,
    rule: RuleId,
    message: string,
    allowedBy?: string
  ): void => {
    violations.push({
      file: relativePath,
      line: lineOf(index),
      column: columnOf(index),
      rule,
      message,
      snippet: snippetAt(index),
      allowedBy,
    });
  };

  for (const span of spans) {
    if (span.kind !== 'template') continue;
    if (span.interpolations.length === 0) continue;

    const { tag } = precedingTag(content, span.start);

    if (tag === 'sql.raw') {
      push(
        span.start,
        'SQL_RAW',
        '`sql.raw` bypasses parameterisation completely — every interpolated value becomes code'
      );
      continue;
    }

    if (tag === 'sql') {
      push(
        span.start,
        'SQL_TAG',
        'a `sql` tagged template interpolates a value; use `?` placeholders instead'
      );
      continue;
    }

    if (!looksLikeSql(span.text)) continue;

    const allAllowed =
      span.interpolations.length > 0 &&
      span.interpolations.every(
        (interpolation) =>
          isBareIdentifier(interpolation.expression) &&
          interpolation.expression.trim() in ALLOWED_IDENTIFIERS
      );

    if (allAllowed) {
      const reason = ALLOWED_IDENTIFIERS[span.interpolations[0].expression.trim()];
      push(
        span.start,
        'SQL_TEMPLATE',
        'SQL template literal interpolates a value',
        `allowed identifier: ${reason}`
      );
      continue;
    }

    push(
      span.start,
      'SQL_TEMPLATE',
      'SQL template literal interpolates a value — use `?` placeholders'
    );
  }

  const callPattern = /\.([A-Za-z_$][\w$]*)\s*\(/g;
  const interestingCalls = new Set(['prepare', 'exec', 'execute']);

  let callMatch: RegExpExecArray | null;
  while ((callMatch = callPattern.exec(structure)) !== null) {
    const method = callMatch[1];
    if (!interestingCalls.has(method)) continue;

    const openParen = callMatch.index + callMatch[0].length - 1;

    let depth = 0;
    let closeParen = -1;
    for (let i = openParen; i < structure.length; i += 1) {
      if (structure[i] === '(') depth += 1;
      else if (structure[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParen = i;
          break;
        }
      }
    }
    if (closeParen === -1) continue;

    const argStart = openParen + 1;
    const argText = content.slice(argStart, closeParen);
    const trimmed = argText.trim();

    if (trimmed.length === 0) continue;

    const argSpan = spans.find(
      (span) =>
        span.start >= argStart &&
        span.end <= closeParen &&
        content.slice(span.start, span.end).trim() === trimmed
    );

    if (argSpan && argSpan.kind !== 'template') {
      continue;
    }

    if (argSpan && argSpan.kind === 'template') {
      continue;
    }

    if (isBareIdentifier(trimmed) && trimmed in ALLOWED_IDENTIFIERS) {
      push(
        argStart,
        method === 'prepare' ? 'SQL_PREPARE' : 'SQL_EXEC',
        `\`${method}()\` receives a dynamic statement`,
        `allowed identifier: ${ALLOWED_IDENTIFIERS[trimmed]}`
      );
      continue;
    }

    const rule: RuleId = method === 'prepare' ? 'SQL_PREPARE' : 'SQL_EXEC';
    const reason = trimmed.includes('+')
      ? 'the statement is assembled with `+` — use `?` placeholders'
      : 'the statement is not a plain string literal';

    push(argStart, rule, `\`${method}()\` receives a non-literal statement: ${reason}`);
  }

  for (const span of spans) {
    const after = content.slice(span.end);
    const plusMatch = after.match(/^\s*\+/);
    if (!plusMatch) continue;

    if (!looksLikeSql(span.text)) continue;
    if (!SQL_KEYWORDS.test(span.text)) continue;

    push(span.end, 'SQL_CONCAT', 'a SQL string is concatenated with `+` — use `?` placeholders');
  }

  return violations;
}

function isExcluded(relativePath: string): { excluded: boolean; reason?: string } {
  for (const entry of EXCLUDED_PATHS) {
    if (
      relativePath === entry.path ||
      relativePath.startsWith(entry.path) ||
      (entry.path.endsWith('/') && relativePath.startsWith(entry.path))
    ) {
      return { excluded: true, reason: entry.reason };
    }
  }
  return { excluded: false };
}

function whitelistReason(violation: Violation): string | undefined {
  for (const entry of WHITELIST) {
    const pathMatches =
      violation.file === entry.path ||
      (entry.path.endsWith('/') && violation.file.startsWith(entry.path));
    if (!pathMatches) continue;

    if (entry.line !== undefined && entry.line !== violation.line) continue;

    if (entry.pattern && !entry.pattern.test(violation.snippet)) continue;

    return entry.reason;
  }
  return undefined;
}

function collectFiles(): string[] {
  const files: string[] = [];

  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = join(directory, entry);
      let stats;
      try {
        stats = statSync(absolute);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.open-next') continue;
        walk(absolute);
        continue;
      }

      if (SCAN_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
        files.push(absolute);
      }
    }
  };

  for (const root of SCAN_ROOTS) {
    walk(join(REPO_ROOT, root));
  }

  return files;
}

function main(): void {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  const files = collectFiles();
  const violations: Violation[] = [];
  const allowed: Violation[] = [];
  let scanned = 0;
  let skippedFiles = 0;

  for (const absolute of files) {
    const relativePath = relative(REPO_ROOT, absolute).split(sep).join('/');

    const exclusion = isExcluded(relativePath);
    if (exclusion.excluded) {
      skippedFiles += 1;
      if (verbose) {
        console.log(`[SKIP] ${relativePath} — ${exclusion.reason}`);
      }
      continue;
    }

    scanned += 1;

    for (const violation of analyseFile(absolute, relativePath)) {
      const reason = whitelistReason(violation);
      if (reason) {
        violation.allowedBy = reason;
        allowed.push(violation);
      } else {
        violations.push(violation);
      }
    }
  }

  if (verbose) {
    for (const entry of allowed) {
      console.log(
        `[ALLOW] ${entry.file}:${entry.line}:${entry.column} [${entry.rule}] ${entry.allowedBy}`
      );
      console.log(`         ${entry.snippet}`);
    }
    console.log('');
  }

  console.log(`SQL lint: scanned ${scanned} file(s), skipped ${skippedFiles}.`);

  if (violations.length === 0) {
    console.log('No SQL interpolation found.');
    process.exit(0);
  }

  console.log('');
  console.log(`${violations.length} SQL interpolation violation(s):`);
  console.log('');

  for (const violation of violations.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
  )) {
    console.log(`${violation.file}:${violation.line}:${violation.column}  [${violation.rule}]  ${violation.message}`);
    console.log(`    ${violation.snippet}`);
  }

  console.log('');
  console.log('Fix: replace the interpolation with a `?` placeholder and bind the value.');
  console.log('If the interpolation is provably safe, add a justified entry to WHITELIST in scripts/lint-sql.ts.');
  console.log('');

  process.exit(1);
}

main();
