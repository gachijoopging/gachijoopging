import { useState } from 'react';
import { View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, type Scheme } from './src/theme.tsx';
import { Catalog } from './src/Catalog.tsx';
import { light } from './tokens/colors.ts';

export default function App() {
  const system = useColorScheme();
  const [scheme, setScheme] = useState<Scheme>(system === 'dark' ? 'dark' : 'light');
  const [loaded] = useFonts({
    'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.ttf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.ttf'),
  });

  // 폰트가 붙기 전에 그리면 시스템 글꼴로 한 번 그렸다가 튑니다.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: light.bg }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider scheme={scheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Catalog scheme={scheme} onScheme={setScheme} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
