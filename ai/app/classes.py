"""7종 카테고리.

`CLASSES` 의 **순서가 곧 클래스 인덱스**이고 학습·서빙이 공유한다
(`docs/openapi.yaml`, `진행상황.md` §3.1). 순서를 바꾸면 이미 학습한 weights 의
출력이 전부 다른 카테고리로 해석된다 — 에러 없이 조용히 틀린다.
"""

CLASSES: tuple[str, ...] = (
    "CIGARETTE",
    "CAN",
    "PLASTIC",
    "PAPER",
    "GLASS",
    "VINYL",
    "GENERAL",
)


def validate_model_names(names: dict[int, str]) -> None:
    """weights 의 클래스 이름·순서가 `CLASSES` 와 같은지 확인한다. 로드 시점에 1회.

    W1 의 COCO 매핑이 있던 자리다. 그 매핑은 모르는 이름을 `GENERAL` 로 보내
    **응답이 항상 7종 중 하나임을 보장**했는데, ⑬ 에서 매핑을 지우면서 그 보장이
    사라졌다. 대신 여기서 막는다 — 이름이 다르면 계약 밖 값이 나가고, 순서가 다르면
    인덱스가 다른 카테고리로 해석된다. 둘 다 에러 없이 조용히 틀리는 종류다.

    호출자는 `_load_and_warmup` 이고, 예외는 거기서 `_load_error` 가 되어
    503 + `/healthz` 로 이유가 드러난다.
    """
    actual = tuple(names[i] for i in sorted(names))
    if actual != CLASSES:
        raise RuntimeError(
            "weights 의 클래스가 계약과 다릅니다"
            f" — 기대 {CLASSES}, 실제 {actual}."
            " weights 를 잘못 지정했거나 학습 때 data.yaml 의 names 가 어긋났습니다."
        )
