import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppHeader, Banner, Button, Card, Chip, Icon, Screen, Txt, pressedOpacity, space, useRipple } from 'design-system/src';

function CrewChoice({
  icon,
  title,
  description,
  onPress,
}: {
  icon: 'plus' | 'key-outline';
  title: string;
  description: string;
  onPress: () => void;
}) {
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${description}`}
      android_ripple={ripple}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressedOpacity(pressed) })}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Icon name={icon} size="md" />
          <View style={{ flex: 1 }}>
            <Txt variant="section" bold>{title}</Txt>
            <Txt variant="caption" tone="muted">{description}</Txt>
          </View>
          <Icon name="chevron-right" size="md" />
        </View>
      </Card>
    </Pressable>
  );
}

export default function CreateOrJoinCrewScreen() {
  return (
    <Screen scroll>
      <AppHeader title="크루 시작하기" onBack={() => router.back()} />

      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Chip label="🌱 크루 시작하기" tone="deep" />
        <Txt variant="title" bold style={{ textAlign: 'center' }}>
          함께 줍는 크루를 선택해 주세요
        </Txt>
        <Txt variant="body" tone="muted" style={{ textAlign: 'center' }}>
          한 사람은 크루 하나에만 소속될 수 있어요.
        </Txt>
      </View>

      <CrewChoice
        icon="plus"
        title="새 크루 만들기"
        description="이름만 정하면 바로 시작해요"
        onPress={() => router.push('/1-7-create-crew')}
      />
      <CrewChoice
        icon="key-outline"
        title="초대 코드로 가입하기"
        description="크루장에게 받은 코드를 입력해요"
        onPress={() => router.push('/1-8-enter-invite-code')}
      />

      <Banner tone="neutral">크루장이 승인하면 크루원이 돼요.</Banner>
      <Button
        label="내 활동 기록 보기"
        variant="ghost"
        size="lg"
        fullWidth
        disabled
        accessibilityLabel="내 활동 기록 보기, 이전 크루의 내 기록 포함"
      />
    </Screen>
  );
}
