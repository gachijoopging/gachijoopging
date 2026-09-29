import '../src/activity/tracking';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'design-system/src';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="location-permission" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
