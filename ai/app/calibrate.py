"""confidence 보정 — ⑯ 은 범위 밖으로 닫혔다 (progress.md §2 W4).

지금은 항등 함수다. **의도적으로 비어 있다** (progress.md §3 "미정 항목을 추측으로
채우지 않는다"). 검증셋 없이 만든 보정 맵은 지표를 왜곡하기만 한다.

다시 열면 할 일 (README §6):
  1. 검증셋 예측을 GT 와 IoU≥0.5 로 매칭해 TP/FP 라벨링 (일의 90%)
  2. confidence 10 bin reliability diagram
  3. `sklearn.isotonic.IsotonicRegression` 으로 raw → 실측 정밀도 단조 매핑 학습
  4. 그 맵을 이 파일에서 로드해 `calibrate()` 가 쓰게 한다

**보정 맵이 바뀌면 weights 가 그대로여도 `modelVersion` 을 올린다** — `aiConfidence` 의
의미가 달라지기 때문이다 (experiment-log.md §5).
"""


def calibrate(raw_confidence: float) -> float:
    """raw confidence → 보정된 `aiConfidence`.

    보정 후에야 `aiConfidence 0.7` 이 "70% 확률로 이 라벨이 맞다"는 실제 의미를 갖는다.
    그때까지 이 값은 모델이 뱉은 raw 값이고, 0.7 임계값은 아직 실측 의미가 없다.
    """
    return raw_confidence
