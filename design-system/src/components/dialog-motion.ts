/** 대화상자가 처음 놓이는 크기. 아주 조금만 작게 시작해 "자리에 놓인다" 로 읽히게 한다 */
const FROM_SCALE = 0.96;

/**
 * 진행도(0 닫힘 → 1 열림)에 따른 대화상자의 투명도와 크기.
 * 동작 줄이기를 켜면 크기는 그대로 두고 투명도만 바뀐다
 */
export function dialogFrame(progress: number, reduceMotion: boolean): { opacity: number; scale: number } {
  return {
    opacity: progress,
    scale: reduceMotion ? 1 : FROM_SCALE + (1 - FROM_SCALE) * progress,
  };
}

