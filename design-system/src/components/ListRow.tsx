import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { radius } from '../../tokens/radius.ts';
import { space, size as sizes } from '../../tokens/spacing.ts';
import { borderWidth } from '../../tokens/elevation.ts';
import { useTheme, useRipple, pressedOpacity, disabledOpacity } from '../theme.tsx';
import { Txt } from './Text.tsx';
import { Icon, type IconName } from './Icon.tsx';

/**
 * 목록 한 줄. 왼쪽 요소 · 제목/부제 · 오른쪽 요소.
 *
 * 목록은 항목이 많아 부모가 다시 그릴 때마다 전부 따라 그리면 스크롤이 끊깁니다.
 * memo 로 감싸 두고, 호출하는 쪽에서 onPress 를 useCallback 으로 고정하세요.
 */
function ListRowBase({
  title,
  subtitle,
  left,
  right,
  icon,
  onPress,
  disabled,
  divider = true,
  chevron = !right,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  divider?: boolean;
  /** 누르는 행의 끝 chevron. right 를 줘도 이동하는 행이면 켠다 */
  chevron?: boolean;
  /** 점·배지처럼 글자가 없는 상태를 읽어 줘야 할 때 (예: "…, 안 읽음") */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: sizes.iconButton,
        paddingVertical: space.md,
        borderBottomWidth: divider ? borderWidth.hairline : 0,
        borderBottomColor: colors.border,
      }}
    >
      {left ?? (icon ? <Icon name={icon} size={22} color={colors.inkMuted} /> : null)}
      {/* 제목과 부제를 한 줄 묶음으로 읽히게 하는 광학 간격. xs(4)면 두 항목으로 갈라져 보입니다. */}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="bodyLg">{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" tone="hint">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {onPress && chevron ? <Icon name="chevron-right" size={20} color={colors.inkHint} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <PressableRow onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel}>
      {body}
    </PressableRow>
  );
}

function PressableRow({
  onPress,
  disabled,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => ({ opacity: disabled ? disabledOpacity : pressedOpacity(pressed) })}
    >
      {children}
    </Pressable>
  );
}

export const ListRow = memo(ListRowBase);

/**
 * 고르는 행. 원본 `bg_select_row_on` — 선택은 라임 테두리 2.5 로 표시합니다.
 * 여기서는 토큰 스케일에 맞춰 2 를 씁니다.
 *
 * **상태를 지고 있는 것은 라디오 표시이지 라임 테두리가 아닙니다.**
 * 라임은 밝은 서피스 위에서 1.41:1 이라 WCAG SC 1.4.11 의 3:1 에 구조적으로 닿을 수
 * 없습니다 — 원본 주석이 하단 내비에서 같은 결론에 도달했던 그 문제입니다.
 * 그래서 라임 테두리는 보강으로 두고, 판별은 deep 채움 라디오(10.15:1 / 4.77:1)가
 * 맡습니다. 라디오를 떼어내면 밝은 테마에서 선택 여부가 보이지 않게 됩니다.
 */
function SelectRowBase({
  title,
  subtitle,
  selected,
  onPress,
  disabled,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={disabled ? undefined : ripple}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: sizes.minTouch,
        padding: space.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: borderWidth.focus,
        borderColor: selected ? colors.lime : colors.border,
        overflow: 'hidden',
        opacity: disabled ? disabledOpacity : pressedOpacity(pressed),
      })}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="bodyLg" bold={selected}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" tone="hint">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View
        style={{
          width: sizes.radio,
          height: sizes.radio,
          borderRadius: sizes.radio / 2,
          borderWidth: borderWidth.focus,
          // 미선택 윤곽은 borderDotted 였는데 서피스 위에서 1.66:1 이라
          // 컨트롤이 거기 있다는 것 자체가 보이지 않았습니다.
          borderColor: selected ? colors.deep : colors.inkHint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: sizes.radioDot,
              height: sizes.radioDot,
              borderRadius: sizes.radioDot / 2,
              backgroundColor: colors.deep,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const SelectRow = memo(SelectRowBase);
