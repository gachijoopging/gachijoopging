import { memo, type ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
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
  onLongPress,
  disabled,
  divider = true,
  subtitleLines,
  chevron = !right,
  tone,
  emphasized,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  icon?: IconName;
  onPress?: () => void;
  /** 길게 눌러 여는 메뉴. 스크린리더는 길게 누르기에 닿지 못하므로 accessibilityActions 로도 함께 노출한다 */
  onLongPress?: () => void;
  disabled?: boolean;
  divider?: boolean;
  /** 부제 줄 수 제한. 미리보기처럼 길어질 수 있는 부제에 준다 */
  subtitleLines?: number;
  /** 누르는 행의 끝 chevron. right 를 줘도 이동하는 행이면 켠다 */
  chevron?: boolean;
  /**
   * 되돌릴 수 없는 동작(삭제 등). 제목과 아이콘을 error 색으로 칠해 다른 행과 가른다.
   * 시트·카드(surface) 위에서만 쓴다 — 화면 배경(bg) 위 error 는 3.76:1 로 본문 하한에 못 미친다
   */
  tone?: 'danger';
  /** 안 읽음처럼 색 점만으로는 구분되지 않는 상태. 제목을 굵게 한다 */
  emphasized?: boolean;
  /** 점·배지처럼 글자가 없는 상태를 읽어 줘야 할 때 (예: "…, 안 읽음") */
  accessibilityLabel?: string;
  /**
   * 행 안의 버튼(right 의 더보기 등)은 행이 한 요소로 읽혀 스크린리더가 따로 닿지 못합니다.
   * 그 동작을 행의 접근성 동작으로 노출합니다.
   */
  accessibilityActions?: PressableProps['accessibilityActions'];
  onAccessibilityAction?: PressableProps['onAccessibilityAction'];
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
      {left ?? (icon ? <Icon name={icon} size={22} color={tone === 'danger' ? colors.error : colors.inkMuted} /> : null)}
      {/* 제목과 부제를 한 줄 묶음으로 읽히게 하는 광학 간격. xs(4)면 두 항목으로 갈라져 보입니다. */}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="bodyLg" bold={emphasized} tone={tone === 'danger' ? 'error' : 'ink'}>{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" tone="hint" numberOfLines={subtitleLines}>
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
    <PressableRow
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      {body}
    </PressableRow>
  );
}

function PressableRow({
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
  children,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityActions?: PressableProps['accessibilityActions'];
  onAccessibilityAction?: PressableProps['onAccessibilityAction'];
  children: ReactNode;
}) {
  const ripple = useRipple();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      onLongPress={onLongPress}
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
