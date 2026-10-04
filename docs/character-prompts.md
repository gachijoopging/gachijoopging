# 캐릭터 7장 생성 프롬프트

ChatGPT 이미지 생성에 **기존 `stage-2-normal.png`(옛 sprout.png)를 참조 이미지로 첨부**하고 아래를 붙여 넣는다.
다시 생성할 때는 `design-system/assets/character/` 의 같은 이름 파일을 덮어쓴다.

## 공통 (모든 프롬프트 앞에 붙임)

```
Same character as the attached reference: a round lime-green sprout mascot with two leaves on top,
thick dark-brown outline, simple dot eyes, pink-orange cheek blush, stubby arms and legs.
Flat vector sticker style, no gradients, no background, transparent PNG, square 1024x1024 (2단계 원본만 1254px),
character centered and filling ~80% of the canvas. Keep exactly the same colors and line weight.
```

## 홈 5단계

| 파일 | 추가 문장 |
|---|---|
| `stage-1-droopy.png` | Pose: sad and droopy. Head tilted down, both leaves wilted and hanging sideways, arms hanging limp, small frown, half-closed eyes, one small sweat drop. |
| `stage-2-normal.png` | Pose: calm and content. Standing straight, arms relaxed at the sides, small closed-mouth smile, eyes open and neutral, leaves upright. No sweat drop, no raised eyebrows. (지금 파일은 옛 sprout.png 라 땀방울이 있어 1단계와 겹친다 — 재생성 권장) |
| `stage-3-excited.png` | Pose: excited. Both arms raised straight up, big open smile, leaves perked up, one leg lifted as if hopping. |
| `stage-4-sparkle.png` | Pose: proud and sparkling. Star-shaped highlights in both eyes, closed happy smile, hands on hips, three or four small yellow four-point sparkles floating around the head. |
| `stage-5-party.png` | Pose: celebrating. Wearing a small striped party cone hat between the leaves, both arms up, mouth wide open in a cheer, a few pieces of colorful confetti falling around (keep confetti inside the canvas). |

## 빈 상태 3장

| 파일 | 추가 문장 |
|---|---|
| `empty-activity.png` | Pose: ready to go out. Holding a small white sneaker in one hand and a folded trash bag in the other, looking to the side with a curious expression, one eyebrow raised. |
| `empty-post.png` | Pose: holding an empty picture frame (simple rectangle with dark outline, nothing inside) in front of the body with both hands, slightly puzzled smile. |
| `empty-notification.png` | Pose: sleeping peacefully. Eyes closed as two curved lines, small "z z" above the head, curled up next to a small plain grey bell lying on its side. No slash or mute mark on the bell — this means "nothing arrived", not "notifications off". (지금 파일은 사선 종이라 알림 꺼짐으로 읽힐 수 있다 — 재생성 권장) |

## 확인

- 배경이 진짜 투명인지 (흰 사각형이 깔려 오면 "transparent background, no white square" 를 추가해 재생성)
- 외곽선 색·두께, 연두색이 참조와 같은지
- 저장 뒤 `cd design-system && npm run web` 카탈로그 "캐릭터" 절에서 7장 비교
