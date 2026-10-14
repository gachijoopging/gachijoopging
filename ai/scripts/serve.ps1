# uvicorn 이 죽으면 다시 띄운다. 터널은 ngrok 서비스가 따로 상주하므로 여기서 다루지 않는다.
# 터널만 살아 있고 uvicorn 이 죽으면 백엔드가 502 를 받아 "AI 서버 다운"과 구별되지 않는다(README §8).
# 등록·확인 절차는 README §9.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = Join-Path (Get-Location) 'serve.log'
# 5.1 의 *>> 는 UTF-16LE 로 쓰고 stderr 를 ErrorRecord 로 감싸 로그가 읽히지 않는다. cmd 로 바이트 그대로 붙인다.
$env:PYTHONUTF8 = '1'
# 5.1 의 Get-Content 는 BOM 이 없으면 cp949 로 읽는다. AppendAllText 는 파일을 새로 만들 때만 BOM 을 붙이므로 머리에 한 번만 들어간다.
$utf8 = New-Object System.Text.UTF8Encoding $true
while ($true) {
  [IO.File]::AppendAllText($log, "$(Get-Date -Format s) uvicorn 시작`r`n", $utf8)
  cmd /c "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >> serve.log 2>&1"
  [IO.File]::AppendAllText($log, "$(Get-Date -Format s) uvicorn 종료 (코드 $LASTEXITCODE) — 3초 뒤 다시 띄운다`r`n", $utf8)
  Start-Sleep -Seconds 3
}
