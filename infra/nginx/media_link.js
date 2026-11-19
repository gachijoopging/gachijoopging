// 사진 URL 서명 검증. 만드는 쪽은 백엔드 MediaSignedUrl 이고 식이 한 글자만 달라도 모든 사진이 403 이 된다.
// nginx 의 secure_link_md5 는 MD5 만 지원해서 njs 로 검증한다.
import crypto from 'crypto';

function verify(r) {
  const signature = r.args.s;
  const expires = r.args.e;
  if (!signature || !/^\d+$/.test(expires) || Number(expires) <= Date.now() / 1000) {
    return '0';
  }
  const expected = crypto
    .createHmac('sha256', r.variables.media_secret)
    .update(expires + r.uri)
    .digest('base64url');
  return sameString(expected, signature) ? '1' : '0';
}

// 틀린 자리에서 멈추지 않는다. 멈추면 응답 시간으로 몇 글자까지 맞았는지가 드러난다
function sameString(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default { verify };
