# 터널만 살아 있고 uvicorn 이 죽으면 백엔드가 502 를 받아 "AI 서버 다운"과 구별되지 않는다(README §8).
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = Join-Path (Get-Location) 'serve.log'
$env:PYTHONUTF8 = '1'
# 5.1 의 Get-Content 는 BOM 이 없으면 cp949 로 읽는다. AppendAllText 는 파일을 새로 만들 때만 BOM 을 붙이므로 머리에 한 번만 들어간다.
$utf8 = New-Object System.Text.UTF8Encoding $true
$wait = 3
while ($true) {
  # uvicorn 은 포트를 bind 하기 전에 모델 로드·워밍업을 먼저 한다. 포트가 잡힌 채 띄우면 매번 GPU 를 쓰고 bind 에서 죽는다.
  if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    [IO.File]::AppendAllText($log, "$(Get-Date -Format s) 8000 포트를 다른 프로세스가 쓰고 있다 — ${wait}초 뒤 다시 본다`r`n", $utf8)
  } else {
    [IO.File]::AppendAllText($log, "$(Get-Date -Format s) uvicorn 시작`r`n", $utf8)
    $started = Get-Date
    # 5.1 의 *>> 는 UTF-16LE 로 쓰고 stderr 를 ErrorRecord 로 감싸 로그가 읽히지 않는다. cmd 로 바이트 그대로 붙인다.
    cmd /c "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >> serve.log 2>&1"
    $code = $LASTEXITCODE
    # 기동 직후 죽는 설정 오류(AI_SECRET 없음 등)는 다시 띄워도 같으므로 간격을 늘린다. 오래 돌다 죽은 것은 바로 살린다.
    if (((Get-Date) - $started).TotalSeconds -ge 30) { $wait = 3 }
    [IO.File]::AppendAllText($log, "$(Get-Date -Format s) uvicorn 종료 (코드 $code) — ${wait}초 뒤 다시 띄운다`r`n", $utf8)
  }
  Start-Sleep -Seconds $wait
  $wait = [Math]::Min($wait * 2, 60)
}
