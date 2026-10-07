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
    const counts = (await Promise.all(spans.map(([from, to]) => source.count(from, to)))).filter((n) => n != null);
    return counts.length ? counts.reduce((a, b) => a + b, 0) : null;
  } catch {
    return null;
  }
}
