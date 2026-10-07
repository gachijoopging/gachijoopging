// 실측 보행 위치 로그를 익명화한 fixture(JSON)로 바꾼다. .ts 를 바로 읽으므로 Node 22.18+ 가 필요하다.
// 1. EXPO_PUBLIC_FIX_LOG=1 로 릴리스 빌드 설치
// 2. 앱이 외부 경로에 파일을 만들지 못하므로 먼저 만든다:
//    adb shell "mkdir -p /sdcard/Android/data/site.gachijoopging.app/files && touch /sdcard/Android/data/site.gachijoopging.app/files/fixlog.txt"
// 3. 걷고 나서 adb pull /sdcard/Android/data/site.gachijoopging.app/files/fixlog.txt walk.log
// 4. node scripts/fixlog-to-fixture.mjs walk.log src/activity/__fixtures__/walk.json
import { readFileSync, writeFileSync } from 'node:fs';
import { anonymize, parseFixLog } from '../src/activity/fix-log.ts';

const [from, to] = process.argv.slice(2);
const fixes = anonymize(parseFixLog(readFileSync(from, 'utf8')));
writeFileSync(to, JSON.stringify(fixes, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${fixes.length} points → ${to}`);
