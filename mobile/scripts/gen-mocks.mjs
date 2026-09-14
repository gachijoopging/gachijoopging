/**
 * docs/openapi.yaml 의 응답 example 을 그대로 TS 로 옮긴다.
 * 손으로 베끼면 계약이 바뀔 때 갈라지고, 없는 숫자를 지어내게 된다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../../docs/openapi.yaml');
const outPath = resolve(here, '../src/api/mocks.generated.ts');

const spec = parse(readFileSync(specPath, 'utf8'));

// 여러 경로가 같은 응답(예: TokenPair)을 $ref 로 공유한다. YAML 파서는 $ref 를 풀지
// 않으므로 여기서 한 단계만 직접 풀어 준다 — 안 풀면 그 경로들의 example 이 조용히 빠진다.
function resolveResponse(res) {
  if (!res?.$ref) return res;
  return res.$ref.replace('#/', '').split('/').reduce((node, key) => node?.[key], spec);
}

const entries = [];
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(methods)) {
    for (const [status, resRaw] of Object.entries(op?.responses ?? {})) {
      const res = resolveResponse(resRaw);
      const example = res?.content?.['application/json']?.example;
      if (example === undefined) continue;
      entries.push({ key: `${method.toUpperCase()} ${path}`, status: Number(status), example });
    }
  }
}
entries.sort((a, b) => a.key.localeCompare(b.key));

const body = entries
  .map((e) => `  ${JSON.stringify(e.key)}: ${JSON.stringify(e.example, null, 2).replace(/\n/g, '\n  ')},`)
  .join('\n');

writeFileSync(
  outPath,
  `// 생성물이다. 고치지 말고 \`npm run gen:mocks\` 를 돌린다. 원본은 docs/openapi.yaml 의 example.\n` +
    `export const MOCKS = {\n${body}\n} as const;\n\n` +
    `export type MockKey = keyof typeof MOCKS;\n`,
  'utf8',
);

console.log(`${entries.length}개 example → src/api/mocks.generated.ts`);
