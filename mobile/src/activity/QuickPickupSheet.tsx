import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Appear, Banner, BottomSheet, Button, NumberStepper, Txt, space } from 'design-system/src';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../category';
import { QUANTITY_MAX } from './pickup';
import { isPending, quickPickup, undoPickup, type LastPickup } from './actions';
import { CategoryTile } from './CategoryTile';
import type { Session } from './session';
import { getStored, subscribe } from './store';

type Failure = { kind: 'add'; category: Category; quantity: number } | { kind: 'undo' };

/** 4-6 빠른 줍기. 사진 없이 누르는 즉시 기기에 남기고 보낸다 */
export function QuickPickupSheet({ visible, onClose, session }: { visible: boolean; onClose: () => void; session: Session | null }) {
  const [amounts, setAmounts] = useState<Partial<Record<Category, number>>>({});
  const [invalid, setInvalid] = useState<Partial<Record<Category, boolean>>>({});
  // 여러 개 담기는 한 카드씩만 펼친다 — 모든 카드에 수량 입력을 늘어놓으면 조작이 스무 개가 넘는다
  const [expanded, setExpanded] = useState<Category | null>(null);
  const [last, setLast] = useState<LastPickup | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  // 큐만 바뀌어도(보내기 끝남) "동기화 대기 → 저장됨" 을 다시 그린다
  useSyncExternalStore(subscribe, getStored);

  const add = (category: Category, quantity: number) => {
    try {
      setLast(quickPickup(category, quantity));
      setFailed(null);
    } catch {
      setFailed({ kind: 'add', category, quantity });
    }
  };

  const undo = () => {
    if (!last) return;
    try {
      undoPickup(last);
      setLast(null);
      setFailed(null);
    } catch {
      // 기기에 못 남겼으면 되돌린 것이 아니다. 최근 작업을 그대로 두고 다시 시도하게 한다
      setFailed({ kind: 'undo' });
    }
  };

  const total = session?.itemCount ?? 0;
  const status = failed ? 'failed' : last ? 'last' : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`이번 활동 줍기 ${total}개`}>
      <Txt variant="caption" tone="muted">
        {total === 0 ? '아직 주운 게 없어요. 하나 담기 또는 수량을 입력하세요' : '하나 담기 또는 수량을 입력하세요'}
      </Txt>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {CATEGORIES.map((c) => {
          const amount = amounts[c] ?? 1;
          const name = CATEGORY_LABEL[c];
          const count = session?.byCategory[c] ?? 0;
          const open = expanded === c;
          return (
            <CategoryTile
              key={c}
              category={c}
              selected={open}
              headerLabel={`${name}, 총 ${count}개`}
              aside={<Txt variant="caption" tone="muted">총 {count}개</Txt>}
            >
              <Button label="하나 담기" size="sm" variant="soft" fullWidth accessibilityLabel={`${name} 하나 담기`} onPress={() => add(c, 1)} />
              <Button
                label={open ? '접기' : '여러 개'}
                size="sm"
                variant="ghost"
                fullWidth
                accessibilityLabel={open ? `${name} 수량 입력 접기` : `${name} 여러 개 담기`}
                accessibilityState={{ expanded: open }}
                onPress={() => setExpanded(open ? null : c)}
              />
              {open ? (
                <>
                  <NumberStepper
                    label={`${name} 추가 수량`}
                    decrementLabel={`${name} 수량 줄이기`}
                    incrementLabel={`${name} 수량 늘리기`}
                    value={amount}
                    min={1}
                    max={QUANTITY_MAX}
                    onChange={(v) => setAmounts((a) => ({ ...a, [c]: v }))}
                    onValidityChange={(ok) => setInvalid((m) => ({ ...m, [c]: !ok }))}
                  />
                  <Button
                    label={`${amount}개 담기`}
                    size="sm"
                    variant="soft"
                    fullWidth
                    accessibilityLabel={`${name} ${amount}개 담기`}
                    disabled={invalid[c]}
                    onPress={() => add(c, amount)}
                  />
                </>
              ) : null}
            </CategoryTile>
          );
        })}
      </View>

      <Appear visible={status != null} rise={0}>
        {/* 안드로이드는 역할만으로 바뀐 문구를 읽지 않는다. 저장 상태가 바뀔 때 알린다 */}
        <View accessibilityLiveRegion="polite">
          {failed?.kind === 'add' ? (
            <Banner tone="danger" action={{ label: '다시 시도', onPress: () => add(failed.category, failed.quantity) }}>
              저장하지 못했어요
            </Banner>
          ) : failed?.kind === 'undo' ? (
            <Banner tone="danger" action={{ label: '다시 시도', onPress: undo }}>
              되돌리지 못했어요
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
        </View>
      </Appear>

      <Button label="닫기" size="lg" fullWidth onPress={onClose} />
    </BottomSheet>
  );
}
