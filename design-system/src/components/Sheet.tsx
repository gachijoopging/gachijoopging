import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, screen, size as sizes } from '../../tokens/spacing.ts';
import { useTheme, depth } from '../theme.tsx';
import { Txt } from './Text.tsx';

/**
 * 바텀시트. 원본 `bg_sheet`(위 모서리만 30) + `bg_sheet_handle` + `bg_scrim`.
 *
 * 스크림을 눌러 닫는 경로를 항상 둡니다 — 안드로이드는 뒤로가기가 있지만
 * iOS 에는 없어서, 이게 없으면 닫을 방법이 사라집니다.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // 스크림이 상태바까지 덮지 않으면 시트가 뜬 상태에서 상단만 원래 화면이
      // 비쳐 보입니다. 안드로이드는 이 값을 줘야 창이 시스템 바 밑으로 확장됩니다.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="닫기"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          // 시트 안을 눌렀을 때 스크림까지 전달되지 않게 막습니다.
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingHorizontal: screen.horizontal,
            paddingTop: space.md,
            paddingBottom: space['3xl'],
            gap: space.lg,
            ...depth('overlay', shadows.overlay),
          }}
        >
          <View
            style={{
              width: sizes.sheetHandleWidth,
              height: sizes.sheetHandleHeight,
              borderRadius: radius.pill,
              backgroundColor: colors.handle,
              alignSelf: 'center',
            }}
          />
          {title ? <Txt variant="title">{title}</Txt> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 가운데 뜨는 대화상자. 중단이 꼭 필요한 확인에만 씁니다. */
export function Dialog({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="닫기"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: screen.horizontal,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            padding: space.xl,
            gap: space.md,
            alignSelf: 'stretch',
            maxWidth: 420,
            ...depth('overlay', shadows.overlay),
          }}
        >
          <Txt variant="title">{title}</Txt>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
