import '../src/activity/tracking';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'design-system/src';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="1-10-location-permission" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
