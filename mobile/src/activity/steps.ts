import { knownPauses, type Session } from './session';

/** Health Connect 를 감싼다. 미지원·미설치·권한 거부를 구분해 돌려준다 */
export type StepSource = {
  status(): Promise<'unavailable' | 'not-installed' | 'denied' | 'granted'>;
  /** 그 구간에 걸음을 쓴 앱이 없으면 null — 0걸음과 다르다 */
  count(from: string, to: string): Promise<number | null>;
};

/** 걸음을 셀 활동 구간들. 일시정지 구간을 모르면 null — 멈춘 동안 걸음이 섞이므로 세지 않는다 */
export function activeSpans(s: Session, now: number): [string, string][] | null {
  const pauses = knownPauses(s);
  if (!pauses) return null;
  const end = s.paused && s.pausedAt ? s.pausedAt : new Date(now).toISOString();
  const spans: [string, string][] = [];
  let from = s.startedAt;
  for (const [pausedAt, resumedAt] of pauses) {
    spans.push([from, pausedAt]);
    from = resumedAt;
  }
  spans.push([from, end]);
  return spans.filter(([a, b]) => Date.parse(b) > Date.parse(a));
}

export async function readSteps(s: Session, now: number, source: StepSource): Promise<number | null> {
  try {
    if ((await source.status()) !== 'granted') return null;
    const spans = activeSpans(s, now);
    if (!spans) return null;
    const counts = await Promise.all(spans.map(([from, to]) => source.count(from, to)));
    // 한 구간이라도 기록이 없으면 활동 전체 걸음을 모른다. 일부 구간 걸음으로 전체 GPS 거리를 보정하면 과하게 줄어든다
    // ponytail: 막 재개한 짧은 구간처럼 실제로 안 걸어 기록이 없어도 미측정이 된다. 실기기에서 자주 보이면 짧은 구간을 예외로 둔다
    return counts.some((n) => n == null) ? null : counts.reduce<number>((a, b) => a + (b ?? 0), 0);
  } catch {
    return null;
  }
}
