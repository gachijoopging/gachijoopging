const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// with-release-signing';

// 카카오맵·Firebase 는 패키지명과 서명 키 해시로 앱을 대조한다. 키가 바뀌면 콘솔 등록을 다시 해야 하므로
// 모든 릴리스 APK 가 같은 키로 서명되게 한다. 키가 없는 사람도 빌드는 되도록 debug 로 물러난다.
// 환경 변수(배포 채널·CI) → mobile/local.properties(로컬) 순으로 읽는다. 값은 docs/operations.md §앱 서명
const RELEASE_CONFIG = `
        release { ${MARKER}
            def localProps = new Properties()
            def localFile = rootProject.file('../local.properties')
            if (localFile.exists()) localFile.withReader('UTF-8') { localProps.load(it) }
            def pick = { String env, String key -> System.getenv(env) ?: localProps.getProperty(key) }
            def store = pick('ANDROID_KEYSTORE_PATH', 'RELEASE_STORE_FILE')
            if (store) {
                storeFile new File(store).isAbsolute() ? file(store) : rootProject.file("../\${store}")
                storePassword pick('ANDROID_KEYSTORE_PASSWORD', 'RELEASE_STORE_PASSWORD')
                keyAlias pick('ANDROID_KEY_ALIAS', 'RELEASE_KEY_ALIAS')
                keyPassword pick('ANDROID_KEY_PASSWORD', 'RELEASE_KEY_PASSWORD') ?: pick('ANDROID_KEYSTORE_PASSWORD', 'RELEASE_STORE_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;
    const signingConfigs = /signingConfigs \{\n(\s+debug \{[\s\S]*?\n\s+\})/;
    const release = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!signingConfigs.test(gradle) || !release.test(gradle)) {
      throw new Error('with-release-signing: app/build.gradle 의 signingConfigs·buildTypes.release 모양이 바뀌었다. 플러그인을 맞춘다');
    }
    gradle = gradle.replace(signingConfigs, (m) => m + RELEASE_CONFIG);
    gradle = gradle.replace(release, '$1signingConfig signingConfigs.release.storeFile ? signingConfigs.release : signingConfigs.debug');
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
