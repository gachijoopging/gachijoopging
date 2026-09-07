import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme.tsx';

/**
 * 아이콘.
 *
 * 기존 앱은 안드로이드 벡터 드로어블 59개를 쓰고 있었습니다. RN 으로 그대로 옮길 수
 * 없어서 Material Design Icons 로 갈아탑니다 — 안드로이드 출신 아이콘이라 기존
 * 모양과 가장 가깝고, 선 굵기가 세트 안에서 일관됩니다.
 *
 * **기본이 장식입니다.** 아이콘 폰트의 글리프는 사설 영역 문자라, 그냥 두면 TalkBack 이
 * 뜻 없는 문자를 읽습니다. 그래서 접근성 트리에서 빼는 것이 기본이고, 아이콘이 유일한
 * 의미 전달 수단일 때만 `label` 로 밖에 내보냅니다.
 *
 * 접근성 속성을 아이콘 컴포넌트에 직접 주면 안 됩니다 — 라이브러리가 그 prop 을
 * 내부 Text 로 전달하지 않아서, 기기에서 확인해 보면 글리프가 그대로 노출됩니다
 * (uiautomator 덤프로 확인한 실제 동작입니다). 그래서 View 로 감싸서 막습니다.
 *
 * 라벨이 이미 옆에 있는 아이콘(버튼 안, 목록 행 앞)에는 `label` 을 주지 마세요 —
 * 스크린리더가 같은 말을 두 번 합니다.
 */
export type IconName = ComponentProps<typeof MaterialDesignIcons>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  /** 생략하면 본문 잉크색 */
  color?: string;
  /**
   * 아이콘이 혼자 의미를 전달할 때만 줍니다. 주면 접근성 트리에 이미지로 노출됩니다.
   * 옆에 글자가 있으면 생략하세요.
   */
  label?: string;
};

export function Icon({ name, size = 24, color, label }: IconProps) {
  const { colors } = useTheme();
  const glyph = <MaterialDesignIcons name={name} size={size} color={color ?? colors.ink} />;

  if (label) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        {glyph}
      </View>
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // 감싸면서 레이아웃이 달라지지 않도록 크기를 그대로 물려줍니다.
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {glyph}
    </View>
  );
}
