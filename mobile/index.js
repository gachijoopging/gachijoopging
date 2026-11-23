// 활동 중 OS 가 프로세스를 정리하면 화면 없이 JS 만 다시 띄워 위치를 넘긴다. 그때는 라우트(_layout)가
// 실행되지 않으므로 배경 위치 작업은 화면보다 먼저, 진입점에서 등록한다
import './src/activity/tracking';
import 'expo-router/entry';
