import { exportFileName, exportRangeError } from './export';

describe('CSV 내보내기 기간 검증', () => {
  test('시작일이 종료일보다 늦으면 막는다', () => {
    expect(exportRangeError('2026-09-10', '2026-09-01')).toBe('시작일은 종료일보다 앞서야 해요.');
  });

  test('같은 날이거나 앞서면 통과한다', () => {
    expect(exportRangeError('2026-09-01', '2026-09-01')).toBeNull();
    expect(exportRangeError('2026-08-31', '2026-09-01')).toBeNull();
  });

  test('YYYY-MM-DD 가 아니거나 없는 날짜면 형식을 알려 준다', () => {
    expect(exportRangeError('2026-9-1', '2026-09-10')).toBe('날짜를 2026-09-01 처럼 입력해 주세요.');
    expect(exportRangeError('2026-02-30', '2026-03-01')).toBe('날짜를 2026-09-01 처럼 입력해 주세요.');
    expect(exportRangeError('2026-13-01', '2026-12-31')).toBe('날짜를 2026-09-01 처럼 입력해 주세요.');
  });
});

describe('CSV 파일 이름', () => {
  test('크루 기록과 기간을 이름에 담는다', () => {
    expect(exportFileName('2026-09-01', '2026-09-30')).toBe('crew-records_2026-09-01_2026-09-30.csv');
  });
});
