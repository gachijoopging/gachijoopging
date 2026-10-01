import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/** 화면 문구 규칙. 정본은 CONTEXT.md 의 용어와 피할 말 */
const ROOTS = [join(__dirname, '..', 'app'), __dirname, join(__dirname, '..', '..', 'design-system', 'src')];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !name.includes('mocks.generated') ? [path] : [];
  });
}

const files = ROOTS.flatMap(sources).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const hits = (pattern: RegExp) =>
  files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((line, i) => {
      // 주석은 문구가 아니다. 줄 머리 주석, JSX 주석, 줄 끝 주석을 뺀다
      // 카탈로그의 note 는 개발자용 설명이라 화면 문구가 아니다
      const code = line.replace(/\{\/\*.*?\*\/\}/g, '').replace(/\s\/\/ .*$/, '').replace(/note="[^"]*"/g, '');
      return pattern.test(code) && !/^\s*(\/\/|\*|\/\*)/.test(code) ? [`${path.split(/[\\/](mobile|design-system)[\\/]/).pop()}:${i + 1}`] : [];
    }),
  );

test('줍기를 수거라고 부르지 않는다', () => {
  expect(hits(/수거/)).toEqual([]);
});

test('사용자를 회원님이라고 부르지 않는다', () => {
  expect(hits(/회원님/)).toEqual([]);
});

test('게시물을 글이라고 부르지 않는다', () => {
  expect(hits(/글쓰기|올린 글|크루 소식/)).toEqual([]);
});

test('되돌릴 수 없는 확인 창의 남는 쪽 버튼은 취소 대신 이어질 행동으로 부른다', () => {
  expect(hits(/label="취소"|cancel: '취소'/)).toEqual([]);
});

test('무엇을 하는지 안 보이는 버튼 이름을 쓰지 않는다', () => {
  expect(hits(/label="(사용|신고 제출|크루 확인|작성|해제|등록|전송)"|'크루 확인'|label="승인 상태 확인"/)).toEqual([]);
});

test('-하세요 · -합니다 대신 해요체로 쓴다', () => {
  expect(hits(/입력하세요|열립니다|보류합니다|불러온 대기/)).toEqual([]);
});

test('시트 메뉴의 동작은 동사형으로 부른다', () => {
  // 확인 창의 버튼은 질문에 답하므로 "삭제" 그대로 둔다. 메뉴 행은 무엇을 시작하는지 말한다
  expect(hits(/title[=:]\s*['"](수정|삭제|신고|기록 삭제)['"]|label="(신고|댓글 삭제|기록 삭제)"/)).toEqual([]);
});

test('스크린리더 이름도 보이는 버튼 이름과 같은 동사를 쓴다', () => {
  expect(hits(/'등록 중'|'신고 제출'|'신고 접수 중'|: '등록'/)).toEqual([]);
});

test('값 자리에 대시를 쓰지 않는다. 미측정·로딩은 말로 쓴다', () => {
  // 카탈로그의 note 는 개발자용 설명이라 화면 문구가 아니다
  expect(hits(/['"`][^'"`]*[—–][^'"`]*['"`]/)).toEqual([]);
});

test('이모지를 아이콘 대신 쓰지 않는다', () => {
  expect(hits(/🌱|🔒/)).toEqual([]);
});

test('여러 항목을 가운뎃점으로 잇지 않는다. 쉼표로 나열한다', () => {
  expect(hits(/게시물·댓글·채팅·위치/)).toEqual([]);
});

test('버튼·칩 문구 안에 가운뎃점으로 문장을 붙이지 않는다', () => {
  expect(hits(/label=\{?[`'"][^`'"]*\s·\s|text: '[^']*\s·\s[^']*'/)).toEqual([]);
});

test('단계 번호를 라벨로 보이지 않는다', () => {
  expect(hits(/>단계 \{/)).toEqual([]);
});

test('제목·빈 상태 문구는 마침표로 끝내지 않는다', () => {
  expect(hits(/<(ErrorState|EmptyState)[^>]*title="[^"]*\."/)).toEqual([]);
});

test('같은 이동은 같은 화살표로 표시한다', () => {
  expect(hits(/보기 →/)).toEqual([]);
});

test('단위는 칩이 아니라 글자로 붙인다', () => {
  expect(hits(/<Chip label="개" \/>/)).toEqual([]);
});

