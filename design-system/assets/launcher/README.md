# 런처 아이콘 원본

옛 앱 `res/drawable/ic_launcher_{foreground,background}.xml` 을 SVG 로 옮긴 것. `app/assets/` 의 PNG 는 여기서 만든다.

```bash
npx -y sharp-cli -i fg.svg   -o ../../../app/assets/android-icon-foreground.png
npx -y sharp-cli -i bg.svg   -o ../../../app/assets/android-icon-background.png
npx -y sharp-cli -i mono.svg -o ../../../app/assets/android-icon-monochrome.png
npx -y sharp-cli -i full.svg -o ../../../app/assets/icon.png
```

배경색 `#E8EFC7` 은 `app.json` 의 `adaptiveIcon.backgroundColor` 와 같아야 한다.
