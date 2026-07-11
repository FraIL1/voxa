#!/usr/bin/env node
/**
 * Проверка лицензий прод-зависимостей (раздел 11 PRD).
 * Разрешены только свободные лицензии. MinIO (AGPL) — внешний сервис
 * через S3-API, npm-зависимостью не является и сюда не попадает.
 */
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  // Шрифты (Inter через @fontsource): PRD раздел 11 явно разрешает SIL OFL
  'OFL-1.1',
  // Zlib — разрешительная лицензия без копилефта (уровень MIT/BSD)
  'Zlib',
]);

/** Поддерживает выражения SPDX вида "(MIT OR Apache-2.0)" и "A AND B". */
function licenseOk(expression) {
  const expr = expression.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALLOWED.has(expr)) return true;
  if (/\sOR\s/.test(expr)) return expr.split(/\sOR\s/).some((part) => licenseOk(part.trim()));
  if (/\sAND\s/.test(expr)) return expr.split(/\sAND\s/).every((part) => licenseOk(part.trim()));
  return false;
}

const raw = execSync('pnpm licenses list --prod --json', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const byLicense = JSON.parse(raw);

const violations = [];
for (const [license, packages] of Object.entries(byLicense)) {
  if (licenseOk(license)) continue;
  for (const pkg of packages) {
    const versions = Array.isArray(pkg.versions) ? pkg.versions.join(', ') : '';
    violations.push(`  ${pkg.name}@${versions} — ${license}`);
  }
}

if (violations.length > 0) {
  console.error('Найдены зависимости с недопустимыми лицензиями:');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('OK: лицензии всех прод-зависимостей допустимы.');
