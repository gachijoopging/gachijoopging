# 운영 .env 를 서버에 올린다. 바이너리로 다루고, 올리기 전에 막히는 조건을 먼저 본다.
#
# 손으로 scp 하지 않는 이유가 셋이다.
#   1) Windows 편집기를 거치면 CR 이 섞인다. docker compose 는 통과시키고 Spring 만
#      Missing key encoding 으로 죽는다 — 배포가 끝난 뒤에야 드러난다
#   2) IMAGE_TAG 는 서버가 관리하는 값이다. 통째로 덮으면 다음 배포가 깨진다
#   3) 값이 쉘 히스토리에 남지 않아야 한다. 여기서는 파일만 옮긴다
#
#   powershell -ExecutionPolicy Bypass -File infra\dev-env.ps1
#   powershell -ExecutionPolicy Bypass -File infra\dev-env.ps1 -DryRun

[CmdletBinding()]
param(
    [string] $EnvFile,
    [string] $KeyFile = "$HOME\.ssh\gachijoopging-deploy",
    [string] $Target  = 'ubuntu@13.125.10.7',
    [string] $Remote  = '/opt/gachijoopging/.env',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

# PS 5.1 은 param() 기본값을 계산할 때 $PSScriptRoot 를 아직 모른다.
if (-not $EnvFile) { $EnvFile = Join-Path $PSScriptRoot '.env' }

# application.yml 이 기본값 없이 ${...} 로 읽는 것들. 비면 기동에서 죽는다.
$required = @(
    'DATABASE_URL', 'DATABASE_USER', 'DATABASE_PASSWORD',
    'JWT_ACTIVE_KID', 'JWT_PRIVATE_KEY_PEM', 'JWT_PUBLIC_KEY_PEM',
    'MEDIA_SECURE_LINK_SECRET', 'REDIS_HOST', 'REDIS_PASSWORD'
)

# 서버가 관리하는 값. 올릴 때 서버 것을 그대로 가져온다.
$serverOwned = @('IMAGE_TAG')

if (-not (Test-Path $EnvFile)) { throw "$EnvFile 이 없다. infra\.env.example 을 복사해 채운다." }
if (-not (Test-Path $KeyFile)) { throw "$KeyFile 이 없다. 배포 키 경로를 -KeyFile 로 준다." }

# ── 읽기: 바이트로 읽는다. Get-Content 는 줄끝을 바꿔 놓는다 ──────────
$bytes = [System.IO.File]::ReadAllBytes($EnvFile)

if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "$EnvFile 에 BOM 이 있다. 첫 키 이름이 깨진다. BOM 없이 다시 쓴다."
}
$cr = ($bytes | Where-Object { $_ -eq 13 }).Count
if ($cr -gt 0) { throw "$EnvFile 에 CR 이 $cr 개 있다. LF 로 다시 쓴다 — 값 끝의 CR 한 글자가 서명·PEM 을 조용히 깨뜨린다." }

$text  = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text -split "`n"

$values = @{}
foreach ($line in $lines) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}

$missing = $required | Where-Object { -not $values.ContainsKey($_) -or $values[$_] -eq '' }
if ($missing) { throw "비어 있으면 백엔드가 기동에서 죽는 키: $($missing -join ', ')" }

# compose 는 env_file 값도 보간한다. $ 하나짜리는 한 글자가 사라진다.
foreach ($key in $values.Keys) {
    $v = $values[$key]
    if ($v -match '\$' -and $v -notmatch '\$\$') {
        throw "$key 의 값에 `$ 가 홀로 있다. compose 가 먹어 버린다 — `$`$ 로 적는다."
    }
}

Write-Host ("읽었다: {0} — 키 {1}개 · {2}바이트 · CR 없음 · BOM 없음" -f $EnvFile, $values.Count, $bytes.Length)

# ── 서버가 관리하는 값 가져오기 ───────────────────────────────────────
foreach ($key in $serverOwned) {
    $remoteValue = (& ssh -i $KeyFile -o BatchMode=yes $Target "sed -n 's/^${key}=//p' $Remote") 2>$null
    if ($LASTEXITCODE -ne 0) { throw "서버에 붙지 못했다: $Target" }
    $remoteValue = ($remoteValue | Select-Object -First 1)
    $lines = $lines | ForEach-Object {
        if ($_ -match "^${key}=") { "${key}=$remoteValue" } else { $_ }
    }
    Write-Host ("서버 값을 가져왔다: {0}={1}" -f $key, $(if ($remoteValue) { $remoteValue } else { '(빈 값)' }))
}

if ($DryRun) { Write-Host "DryRun — 올리지 않았다."; exit 0 }

# ── 올리기: LF 로 직접 쓴 임시 파일을 scp. BOM 을 붙이지 않는다 ───────
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$tmp = Join-Path $env:TEMP ('gachijoopging-env-' + [guid]::NewGuid())
try {
    [System.IO.File]::WriteAllText($tmp, ($lines -join "`n"), $utf8NoBom)
    & scp -i $KeyFile -o BatchMode=yes $tmp "${Target}:$Remote"
    if ($LASTEXITCODE -ne 0) { throw "scp 실패" }
} finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

# ── 확인: 서버에서 직접 본다 ─────────────────────────────────────────
# here-string 은 이 파일의 줄끝(CRLF)을 그대로 들고 간다. 그대로 ssh 에 넘기면
# 원격 쉘이 CR 을 인자의 일부로 읽어 `chmod: cannot access '....env'$'\r'` 가 된다.
# CR 을 막는 스크립트가 CR 에 당하는 자리라 한 번 더 지운다.
$remote = @"
chmod 600 $Remote
echo "파일   `$(file -b $Remote)"
echo "CR     `$(tr -dc '\015' < $Remote | wc -c) 바이트"
echo "키     `$(grep -c '^[A-Z]' $Remote) 개"
echo "머리   `$(od -c $Remote | head -1)"
"@ -replace "`r", ""

$check = & ssh -i $KeyFile -o BatchMode=yes $Target $remote
$check | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "반영하려면 컨테이너를 다시 만든다 — restart 는 env_file 을 다시 읽지 않는다:"
Write-Host "  ssh -i $KeyFile $Target 'cd /opt/gachijoopging && docker compose up -d --force-recreate backend'"
