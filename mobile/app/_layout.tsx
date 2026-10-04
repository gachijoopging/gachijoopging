import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useReduceMotion } from 'design-system/src';

function RootStack() {
  const reduce = useReduceMotion();
  // 화면은 오른쪽에서 들어와 같은 길로 나간다. 새로 쓰는 작업은 시트처럼 아래에서 올라와 아래로 내려간다.
  // 동작 줄이기를 켜면 미는 움직임 대신 제자리에서 흐려졌다 선명해진다
  const compose = reduce ? 'fade' : 'slide_from_bottom';
  return (
    <Stack screenOptions={{ headerShown: false, animation: reduce ? 'fade' : 'ios_from_right' }}>
      <Stack.Screen name="posts/new" options={{ animation: compose }} />
      <Stack.Screen name="report" options={{ animation: compose }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <RootStack />
    </ThemeProvider>
  );
}
