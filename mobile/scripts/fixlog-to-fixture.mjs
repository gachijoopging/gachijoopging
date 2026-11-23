// .ts 를 바로 읽으므로 Node 22.18+ 가 필요하다. 절차는 mobile/CLAUDE.md §실측 위치 로그
import { readFileSync, writeFileSync } from 'node:fs';
import { anonymize, parseFixLog } from '../src/activity/fix-log.ts';

const [from, to] = process.argv.slice(2);
const fixes = anonymize(parseFixLog(readFileSync(from, 'utf8')));
writeFileSync(to, JSON.stringify(fixes, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${fixes.length} points → ${to}`);
