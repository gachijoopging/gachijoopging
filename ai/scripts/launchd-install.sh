#!/bin/sh
# 서빙 맥에 uvicorn 과 ngrok 을 launchd 에이전트로 따로 상주시킨다. 다시 돌려도 된다 (README §9).
# 터널만 살아 있고 uvicorn 이 죽으면 백엔드가 502 를 받아 "AI 서버 다운"과 구별되지 않는다(README §8).
set -eu
ai=$(cd "$(dirname "$0")/.." && pwd)
domain=$(sed -n 's/^NGROK_DOMAIN=//p' "$ai/.env" 2>/dev/null | tr -d '\r')
[ -n "$domain" ] || { echo "ai/.env 에 NGROK_DOMAIN 이 없다" >&2; exit 1; }
ngrok=$(command -v ngrok) || { echo "ngrok 이 없다 — brew install ngrok" >&2; exit 1; }
(cd "$ai" && uv sync --frozen)

agents=$HOME/Library/LaunchAgents
gui=gui/$(id -u)
mkdir -p "$agents"

cat > "$agents/site.gachijoopging.ai-serve.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>site.gachijoopging.ai-serve</string>
  <key>ProgramArguments</key><array>
    <string>$ai/.venv/bin/uvicorn</string><string>app.main:app</string>
    <string>--host</string><string>127.0.0.1</string><string>--port</string><string>8000</string>
  </array>
  <key>WorkingDirectory</key><string>$ai</string>
  <key>EnvironmentVariables</key><dict><key>PYTHONUTF8</key><string>1</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>3</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$ai/serve.log</string>
  <key>StandardErrorPath</key><string>$ai/serve.log</string>
</dict></plist>
EOF

cat > "$agents/site.gachijoopging.ai-ngrok.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>site.gachijoopging.ai-ngrok</string>
  <key>ProgramArguments</key><array>
    <string>$ngrok</string><string>http</string><string>8000</string>
    <string>--url=https://$domain</string><string>--log=stdout</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>$ai/ngrok.log</string>
  <key>StandardErrorPath</key><string>$ai/ngrok.log</string>
</dict></plist>
EOF

for name in ai-serve ai-ngrok; do
  launchctl bootout "$gui/site.gachijoopging.$name" 2>/dev/null || true
  # bootout 은 끝나기 전에 돌아온다. 남아 있는 채로 bootstrap 하면 "Input/output error" 로 실패한다.
  while launchctl print "$gui/site.gachijoopging.$name" >/dev/null 2>&1; do sleep 0.2; done
  launchctl bootstrap "$gui" "$agents/site.gachijoopging.$name.plist"
done
launchctl list | grep site.gachijoopging
