import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { BottomNav, space, useTheme } from 'design-system/src';
import { TABS, tabValueOf, type TabValue } from '../../src/tabs';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const current = tabValueOf(state.routes[state.index]?.name ?? 'index');
  const go = (v: TabValue) => navigation.navigate(v);

  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, backgroundColor: colors.bg }}>
      <BottomNav
        items={TABS}
        value={current}
        onChange={go}
        startAction={{ label: '줍깅', icon: 'delete-outline', onPress: () => go('plogging') }}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.value} name={t.value} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
