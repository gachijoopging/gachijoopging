import {
  AppHeader,
  IconButton,
  type AppHeaderProps,
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
