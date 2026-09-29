import { characterBubble, myCategorySummary } from './home';

describe('크루 캐릭터 말풍선', () => {
  test('목표에 못 미치면 남은 개수를 알려 준다', () => {
    expect(characterBubble({ windowDays: 14, items: 250, goalCount: 300 })).toBe(
      '최근 14일 250개, 목표까지 50개',
    );
  });

  test('목표에 닿았거나 넘으면 달성이라고 한다', () => {
    expect(characterBubble({ windowDays: 14, items: 312, goalCount: 300 })).toBe(
      '최근 14일 312개, 목표 달성!',
    );
    expect(characterBubble({ windowDays: 14, items: 300, goalCount: 300 })).toBe(
      '최근 14일 300개, 목표 달성!',
    );
  });
});

describe('최근 7일 내가 주운 쓰레기 부제', () => {
  test('수량이 많은 순서로 한글 이름과 개수를 잇는다', () => {
    expect(myCategorySummary({ PLASTIC: 6, CAN: 3, CIGARETTE: 14 })).toBe('담배꽁초 14 · 플라스틱 6 · 캔 3');
  });

  test('최대 3개까지만 보인다', () => {
    expect(myCategorySummary({ CIGARETTE: 14, PLASTIC: 6, CAN: 3, PAPER: 1 })).toBe('담배꽁초 14 · 플라스틱 6 · 캔 3');
  });

  test('주운 게 없으면 아직 없다고 한다', () => {
    expect(myCategorySummary({})).toBe('아직 없어요');
  });
});
