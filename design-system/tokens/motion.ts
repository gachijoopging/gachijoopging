/**
 * 움직임 토큰.
 *
 * 스프링은 Apple 이 쓰는 두 값(response · damping ratio)으로 정하고 RN `Animated.spring` 의
 * stiffness · damping 으로 바꿉니다. 고정 시간 애니메이션과 달리 스프링은 지금 화면에 있는
 * 값과 속도에서 이어지므로, 움직이는 도중에 다시 눌러도 튀지 않습니다.
 *
 *   response      한 번 출렁이는 데 걸리는 시간(초). 작을수록 빠릅니다
 *   dampingRatio  1 은 넘치지 않고 멈춤, 1 미만은 살짝 넘쳤다 돌아옴
 *
 * 넘침(0.8)은 손가락이 속도를 실어 던졌을 때만 씁니다. 탭으로 열린 것이 출렁이면 어색합니다.
 */
function spring(response: number, dampingRatio: number) {
  return {
    stiffness: (2 * Math.PI / response) ** 2,
    damping: (4 * Math.PI * dampingRatio) / response,
    mass: 1,
  };
}

export const motion = {
  /** 기본. 선택 표시 · 나타남 */
  settle: spring(0.3, 1),
  /** 시트가 탭으로 열리고 닫힐 때 */
  sheet: spring(0.35, 1),
  /** 손으로 끌다 놓았을 때. 실어 온 속도만큼 살짝 넘친다 */
  fling: spring(0.3, 0.8),
} as const;

/**
 * 놓은 속도로 "어디까지 미끄러질지"를 계산합니다(스크롤 감속과 같은 지수 감쇠).
 * 놓은 자리가 아니라 이 투영점에서 가까운 목적지를 고르면, 살짝 튕겨도 닫힙니다.
 * `velocity` 는 px/ms (RN 제스처의 vy).
 */
export function projectedDistance(velocity: number, decelerationRate = 0.998): number {
  return (velocity * decelerationRate) / (1 - decelerationRate);
}

/** 경계 밖으로 끌수록 덜 따라오게 합니다. 딱 멈추면 고장 난 것처럼 읽힙니다 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** 탭과 끌기를 가르는 문턱(px). 제목을 누를 때 손가락이 조금 떨려도 시트가 따라 흔들리지 않는다 */
export const DRAG_SLOP = 10;

/** 문턱 안의 움직임은 버리고, 넘으면 넘은 만큼만 따라간다. 문턱을 넘는 순간 튀지 않게 한다 */
export function dragAfterSlop(dy: number, slop = DRAG_SLOP): number {
  if (Math.abs(dy) <= slop) return 0;
  return dy - Math.sign(dy) * slop;
}
