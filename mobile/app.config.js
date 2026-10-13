// app.json 을 읽어 비밀값만 환경 변수에서 채운다. 키를 app.json 에 넣지 않는다 — 그 파일은 커밋된다.
const base = require('./app.json').expo;

const kakaoNativeAppKey = process.env.KAKAO_NATIVE_APP_KEY ?? '';

module.exports = {
  ...base,
  // 카카오 로그인 플러그인은 앱 키를 manifest 의 redirect scheme 에 박는다. 키가 없으면 빈 scheme 이 생기므로 빼 둔다
  plugins: kakaoNativeAppKey ? [...base.plugins, ['@react-native-seoul/kakao-login', { kakaoAppKey: kakaoNativeAppKey }]] : base.plugins,
  extra: {
    ...base.extra,
    kakaoNativeAppKey,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
    apiBaseUrl: process.env.API_BASE_URL ?? '',
    wsUrl: process.env.WS_URL ?? '',
  },
};
