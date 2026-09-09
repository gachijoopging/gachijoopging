import {
  AppHeader,
  BottomNav,
  Checkbox,
  NumberStepper,
  Switch,
  IconButton,
  type AppHeaderProps,
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
  variant: 'surface',
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
const field: FieldProps = { endAdornment: null };

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

void visualVariants;
void deepChip;
void largeAvatar;
void NumberStepper;
void numberStepper;
