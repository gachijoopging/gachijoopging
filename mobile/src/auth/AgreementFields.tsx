import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Checkbox, Loading, Txt, space } from 'design-system/src';
import type { AgreementItem, AgreementType } from './agreements';
const labels: Record<AgreementType, string> = { TERMS: '이용약관 동의', PRIVACY: '개인정보 동의', MARKETING: '마케팅 정보 수신 동의' };
export function AgreementFields({ items, onChange, failed, onRetry, disabled }: {
  items: readonly AgreementItem[] | null; onChange: (type: AgreementType, agreed: boolean) => void; failed: boolean; onRetry: () => void; disabled?: boolean;
}) {
  const [linkFailed, setLinkFailed] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      {failed ? <Banner tone="warn" action={{ label: '다시 시도', onPress: onRetry }}>동의 항목을 불러오지 못했어요. 다시 시도해 주세요.</Banner> : null}
      {!items && !failed ? <Loading label="동의 항목을 불러오고 있어요" /> : null}
      {items?.map((item) => (
        <View key={item.type} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}><Checkbox label={`${item.required ? '필수' : '선택'} ${labels[item.type]}`} checked={item.agreed} onChange={(agreed) => onChange(item.type, agreed)} disabled={disabled || failed} /></View>
          <Button label="내용 보기" variant="ghost" size="sm" disabled={disabled} onPress={() => { setLinkFailed(false); void Linking.openURL(item.url).catch(() => setLinkFailed(true)); }} />
        </View>
      ))}
      {linkFailed ? <Txt variant="caption" tone="error">전문을 열지 못했어요. 다시 시도해 주세요.</Txt> : null}
    </View>
  );
}
