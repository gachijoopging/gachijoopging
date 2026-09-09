import {
  AppHeader,
  BottomNav,
  IconButton,
  type AppHeaderProps,
  type BottomNavProps,
  type IconButtonProps,
} from './src/index.ts';

const appHeader: AppHeaderProps = {
  title: '설정',
  subtitle: '모임을 관리해요',
  onBack: () => {},
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

const bottomNav: BottomNavProps<'home' | 'feed' | 'meet' | 'me'> = {
  items: [
    { value: 'home', label: '홈', icon: 'home' },
    { value: 'feed', label: '피드', icon: 'view-list' },
    { value: 'meet', label: '모임', icon: 'account-group' },
    { value: 'me', label: '내 정보', icon: 'account' },
  ],
  value: 'home',
  onChange: () => {},
  startAction: { icon: 'plus', label: '시작', onPress: () => {} },
};

void BottomNav;
void bottomNav;
