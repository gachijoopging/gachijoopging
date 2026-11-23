const { withProjectBuildGradle } = require('expo/config-plugins');

const KAKAO_REPO = "maven { url 'https://devrepo.kakao.com/nexus/content/groups/public/' }";

/**
 * 카카오맵 SDK 는 카카오 사설 저장소에만 있다. 저장소 선언은 프로젝트 수준이라야 앱 classpath 해석에
 * 쓰이는데, android/ 는 expo prebuild 가 다시 만들므로 여기서 넣는다.
 */
module.exports = function withKakaoMaven(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(KAKAO_REPO)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      "maven { url 'https://www.jitpack.io' }",
      `maven { url 'https://www.jitpack.io' }\n    ${KAKAO_REPO}`,
    );
    return cfg;
  });
};
