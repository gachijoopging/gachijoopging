// app.json 을 읽어 비밀값만 환경 변수에서 채운다. 키를 app.json 에 넣지 않는다 — 그 파일은 커밋된다.
const base = require('./app.json').expo;

module.exports = {
  ...base,
  extra: {
    ...base.extra,
    kakaoNativeAppKey: process.env.KAKAO_NATIVE_APP_KEY ?? '',
  },
};
