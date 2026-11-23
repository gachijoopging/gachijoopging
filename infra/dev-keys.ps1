# 로컬 개발용 JWT 키를 만들어 저장소 루트 .env 에 넣는다. 각자 1회.
#
# 백엔드는 JWT_ACTIVE_KID·JWT_PRIVATE_KEY_PEM·JWT_PUBLIC_KEY_PEM 이 없으면 기동에서 죽는다
# (application.yml — 기본값을 두면 아무 키로나 서명하는 서버가 뜨므로 일부러 그렇게 돼 있다).
#
# 키를 저장소에 커밋하지 않는 이유는 둘이다. 개발 키가 운영에 흘러들 여지를 없애고,
# GitHub 의 비밀 탐지가 커밋된 개인키를 막아 push 자체가 거부되기 때문이다.
#
#   powershell -ExecutionPolicy Bypass -File infra\dev-keys.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

if ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^JWT_PRIVATE_KEY_PEM=' -Quiet)) {
    Write-Host "이미 있다 — $envFile 의 JWT 키를 그대로 쓴다."
    exit 0
}

$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
if (-not $openssl) { $openssl = 'C:\Program Files\Git\usr\bin\openssl.exe' }
if (-not (Test-Path $openssl)) {
    throw "openssl 을 찾지 못했다. Git for Windows 를 설치하거나 openssl 을 PATH 에 넣는다."
}

$tmp = Join-Path $env:TEMP ('gachijoopging-jwt-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp\private.pem"
    & $openssl rsa -pubout -in "$tmp\private.pem" -out "$tmp\public.pem"

    # PEM 을 한 줄로 만든다. 줄바꿈은 \n 두 글자로 넣는다 — RsaPem 이 그 형태를 되돌린다.
    $private = (Get-Content "$tmp\private.pem") -join '\n'
    $public  = (Get-Content "$tmp\public.pem")  -join '\n'

    $block = @"

# 로컬 개발 전용 JWT 키 — infra/dev-keys.ps1 이 만들었다. 운영에 쓰지 않는다.
JWT_ACTIVE_KID=local-dev
JWT_PRIVATE_KEY_PEM=$private
JWT_PUBLIC_KEY_PEM=$public
"@

    # BOM 없는 UTF-8 로 붙인다. Add-Content -Encoding utf8 은 BOM 을 넣는데,
    # notify.mjs 의 parseEnv 가 첫 키 이름 앞에 BOM 을 달고 읽어 값을 못 찾는다.
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($envFile, $block + "`n", $utf8NoBom)

    Write-Host "JWT 키를 $envFile 에 넣었다. (.env 는 .gitignore 가 막는다)"
}
finally {
    Remove-Item -Recurse -Force $tmp
}
