# uvicorn 이 죽으면 다시 띄운다. 터널은 ngrok 서비스가 따로 상주하므로 여기서 다루지 않는다.
# 터널만 살아 있고 uvicorn 이 죽으면 백엔드가 502 를 받아 "AI 서버 다운"과 구별되지 않는다(README §8).
# 등록·확인 절차는 README §9.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = Join-Path (Get-Location) 'serve.log'
while ($true) {
  "$(Get-Date -Format s) uvicorn 시작" | Out-File $log -Append -Encoding utf8
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 *>> $log
  "$(Get-Date -Format s) uvicorn 종료 (코드 $LASTEXITCODE) — 3초 뒤 다시 띄운다" | Out-File $log -Append -Encoding utf8
  Start-Sleep -Seconds 3
}
