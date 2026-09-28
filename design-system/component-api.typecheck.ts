import {
  AppHeader,
  BottomNav,
  Checkbox,
  NumberStepper,
  Switch,
  IconButton,
  IconCircle,
  LinkText,
  MetricSplit,
  type AppHeaderProps,
  type BadgeTone,
  type BannerTone,
  type CardProps,
  type LinkTextProps,
  type MetricSplitProps,
  type AvatarProps,
  type ButtonProps,
  type BottomNavProps,
  type CheckboxProps,
  type FieldProps,
  type IconButtonProps,
  type ChipProps,
  type NumberStepperProps,
  type SwitchProps,
} from './src/index.ts';

const appHeader: AppHeaderProps = {
  title: '설정',
  subtitle: '모임을 관리해요',
  onBack: () => {},
  backDisabled: true,
};

const iconButton: IconButtonProps = {
  icon: 'arrow-left',
  label: '뒤로 가기',
  onPress: () => {},
  tone: 'surface',
};

void AppHeader;
void IconButton;
void appHeader;
void iconButton;

const bottomNav: BottomNavProps<'home' | 'feed' | 'start' | 'meet' | 'me'> = {
  items: [
    { value: 'home', label: '홈', icon: 'home' },
    { value: 'feed', label: '피드', icon: 'view-list' },
    { value: 'start', label: '줍깅', icon: 'plus' },
    { value: 'meet', label: '모임', icon: 'account-group' },
    { value: 'me', label: '내 정보', icon: 'account' },
  ],
  value: 'home',
  onChange: () => {},
  startAction: { icon: 'plus', label: '시작', onPress: () => {} },
};

void BottomNav;
void bottomNav;

const toggle: SwitchProps = {
  label: '알림 받기',
  value: true,
  onValueChange: () => {},
};
const checkbox: CheckboxProps = {
  label: '이용약관에 동의합니다',
  checked: false,
  onChange: () => {},
};
const field: FieldProps = { endAdornment: null, multiline: true, maxLines: 4 };

void Switch;
void Checkbox;
void toggle;
void checkbox;
void field;

const visualVariants: ButtonProps['variant'][] = ['deep', 'danger', 'ghostDanger', 'translucent'];
const deepChip: ChipProps = { label: '선택됨', tone: 'deep' };
const largeAvatar: AvatarProps = { name: '가치줍깅', size: 'xl' };
const numberStepper: NumberStepperProps = {
  label: '참여 인원',
  min: 1,
  max: 8,
  value: 4,
  onChange: () => {},
  onValidityChange: () => {},
};

const pressableCard: CardProps = { onPress: () => {}, disabled: true, accessibilityLabel: '크루 만들기' };
const overlayChip: ChipProps = { label: '방금 촬영한 수거물', tone: 'overlay' };
const disabledChip: ChipProps = { label: '이번 주', onPress: () => {}, disabled: true };
const neutralBanner: BannerTone = 'neutral';
const warnBadge: BadgeTone = 'warn';
const link: LinkTextProps = { label: '회원가입', onPress: () => {}, tone: 'onPhoto' };
const metrics: MetricSplitProps = {
  items: [{ value: '27', label: '개수' }],
  divider: 'dashed',
  accessibilityLabel: '개수 27개',
};

void pressableCard;
void overlayChip;
void disabledChip;
void neutralBanner;
void warnBadge;
void link;
void metrics;
void IconCircle;
void LinkText;
void MetricSplit;
void visualVariants;
void deepChip;
void largeAvatar;
void NumberStepper;
void numberStepper;
