import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Banner, BottomSheet, Button, Icon, NumberStepper, Tile, Txt, space } from 'design-system/src';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, type Category } from '../category';
import { QUANTITY_MAX } from './pickup';
import { isPending, quickPickup, undoPickup, type LastPickup } from './actions';
import type { Session } from './session';
import { getStored, subscribe } from './store';

/** 4-6 빠른 줍기. 사진 없이 누르는 즉시 기기에 남기고 보낸다 */
export function QuickPickupSheet({ visible, onClose, session }: { visible: boolean; onClose: () => void; session: Session | null }) {
  const [amounts, setAmounts] = useState<Partial<Record<Category, number>>>({});
  const [invalid, setInvalid] = useState<Partial<Record<Category, boolean>>>({});
  const [last, setLast] = useState<LastPickup | null>(null);
  const [failed, setFailed] = useState<{ category: Category; quantity: number } | null>(null);
  // 큐만 바뀌어도(보내기 끝남) "동기화 대기 → 저장됨" 을 다시 그린다
  useSyncExternalStore(subscribe, getStored);

  const add = (category: Category, quantity: number) => {
    try {
      setLast(quickPickup(category, quantity));
      setFailed(null);
    } catch {
      setFailed({ category, quantity });
    }
  };

  const undo = () => {
    if (!last) return;
    try {
      undoPickup(last);
      setLast(null);
    } catch {
      setFailed(null);
    }
  };

  const total = session?.itemCount ?? 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`이번 활동 줍기 ${total}개`}>
      <Txt variant="caption" tone="muted">
        {total === 0 ? '아직 주운 게 없어요. 하나 담기 또는 수량을 입력하세요' : '하나 담기 또는 수량을 입력하세요'}
      </Txt>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        {CATEGORIES.map((c) => {
          const amount = amounts[c] ?? 1;
          const name = CATEGORY_LABEL[c];
          return (
            <Tile key={c} tone="tint" style={{ flexBasis: '47%', flexGrow: 1, gap: space.sm }}>
              <View accessible accessibilityLabel={`${name}, 총 ${session?.byCategory[c] ?? 0}개`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Icon name={CATEGORY_ICON[c]} size={18} />
                <Txt variant="label" style={{ flex: 1 }}>{name}</Txt>
                <Txt variant="caption" tone="muted">총 {session?.byCategory[c] ?? 0}개</Txt>
              </View>
              <Button label="하나 담기" size="sm" variant="ghost" fullWidth accessibilityLabel={`${name} 하나 담기`} onPress={() => add(c, 1)} />
              <NumberStepper
                label={`${name} 추가 수량`}
                value={amount}
                min={1}
                max={QUANTITY_MAX}
                onChange={(v) => setAmounts((a) => ({ ...a, [c]: v }))}
                onValidityChange={(ok) => setInvalid((m) => ({ ...m, [c]: !ok }))}
              />
              <Button
                label="담기"
                size="sm"
                fullWidth
                accessibilityLabel={`${name} ${amount}개 담기`}
                disabled={invalid[c]}
                onPress={() => add(c, amount)}
              />
            </Tile>
          );
        })}
      </View>

      <View style={{ marginTop: space.md, gap: space.sm }}>
        {failed ? (
          <Banner tone="danger" action={{ label: '다시 시도', onPress: () => add(failed.category, failed.quantity) }}>
            저장하지 못했어요
          </Banner>
        ) : last ? (
          <Banner
            tone="neutral"
            action={{
              label: '되돌리기',
              accessibilityLabel: `최근 ${CATEGORY_LABEL[last.category]} ${last.quantity}개 담기 되돌리기`,
              onPress: undo,
            }}
          >
            {`${CATEGORY_LABEL[last.category]} ${last.quantity}개 담았어요 · ${isPending(last.itemId) ? '동기화 대기' : '저장됨'}`}
          </Banner>
        ) : null}
        <Button label="닫기" size="lg" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
