# CLAUDE.md

이 파일은 `ai/` 에서 일할 때의 Claude Code 지침이다.

@../AGENTS.md

## 명령

```bash
uv run uvicorn app.main:app --reload   # 개발 서버
uv run uvicorn app.main:app            # 운영 (워커 1개)
uv run python scripts/smoke.py         # 계약 확인. --base-url 로 원격에도 겨눈다
uv run python scripts/draw_boxes.py 사진.jpg   # bbox 를 눈으로 확인
uv run ruff check .
```

`smoke.py` 는 **FAIL 0 · SKIP 0** 이라야 통과다. `SKIP` 이 남으면 `--image` 를 주지 않은 것이다.

의존성은 `uv` 로만 넣는다. `torch`·`torchvision` 은 PyTorch CUDA 인덱스에서 받는다 —
PyPI 휠은 Windows 에서 CPU 전용이라 `torch.cuda.is_available()` 가 False 가 된다.
인덱스를 바꾸면 `uv.lock` 을 다시 만들어야 한다.

## 경계

앱은 FastAPI 를 직접 부르지 않는다. 앱 → Spring → FastAPI 다.
**추론 실패가 사진 업로드를 실패시키지 않는다** — `inference.status = UNAVAILABLE` 로 내려가고
앱은 수동 입력으로 이어간다. 이 폴백을 없애는 변경을 하지 않는다.

계약의 정본은 `docs/openapi.yaml` 이다. 요청·응답 모양을 여기서 임의로 바꾸지 않는다.

## 문서

| 무엇 | 어디 |
|---|---|
| 지금 어디까지 됐나 | `progress.md` |
| 학습 이력·실험 수치 | `experiment-log.md` |
| 끝난 작업의 근거·과정 | `development-log.md` |
| 라벨링 규칙 | `docs/labeling-guide.md` · `docs/photography-guide.md` |
| 전체 설계와 함정 | `README.md` |

## 하지 않는 것

- 데이터셋 이미지·체크포인트를 커밋하지 않는다. git 에 있는 건 서빙 가중치
  `weights/yolo26s-1024-v1.pt` 와 `datasets/*/_split.json`·`substituted.txt` 뿐이다 (`ai/.gitignore` 예외)
- `ai/.env` 의 값을 코드·문서·커밋에 쓰지 않는다
- 실험 정확도를 실환경 정확도로 말하지 않는다. 신뢰도를 정답 확률 %로 표현하지 않는다
