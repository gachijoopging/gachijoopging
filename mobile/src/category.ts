export type Category = 'CIGARETTE' | 'CAN' | 'PLASTIC' | 'PAPER' | 'GLASS' | 'VINYL' | 'GENERAL';

export const CATEGORY_LABEL: Record<Category, string> = {
  CIGARETTE: '담배꽁초',
  CAN: '캔',
  PLASTIC: '플라스틱',
  PAPER: '종이',
  GLASS: '유리',
  VINYL: '비닐',
  GENERAL: '일반',
};

export const CATEGORY_ICON = {
  CIGARETTE: 'smoking',
  CAN: 'cup',
  PLASTIC: 'bottle-soda-outline',
  PAPER: 'file-document-outline',
  GLASS: 'bottle-wine-outline',
  VINYL: 'shopping-outline',
  GENERAL: 'trash-can-outline',
} as const satisfies Record<Category, string>;

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
