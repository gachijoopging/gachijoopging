import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { BottomNav, space, useTheme } from 'design-system/src';
import { PloggingLauncher, usePloggingLauncher } from '../../src/plogging/PloggingLauncher';
import { TABS, tabValueOf, type TabValue } from '../../src/tabs';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const current = tabValueOf(state.routes[state.index]?.name ?? 'index');
  // BottomNav 는 가운데 버튼을 누르면 onPress 전에 onChange('plogging') 도 부른다. 줍깅의 행선지는 enter 가 정한다
  const go = (v: TabValue) => v !== 'plogging' && navigation.navigate(v);
  const plogging = usePloggingLauncher();

  return (
    <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, backgroundColor: colors.bg }}>
      <BottomNav
        items={TABS}
        value={current}
        onChange={go}
        startAction={{ label: '줍깅', icon: 'delete-outline', onPress: plogging.enter }}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <PloggingLauncher>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        {TABS.map((t) => (
          <Tabs.Screen key={t.value} name={t.value} options={{ title: t.label }} />
        ))}
      </Tabs>
    </PloggingLauncher>
  );
}
