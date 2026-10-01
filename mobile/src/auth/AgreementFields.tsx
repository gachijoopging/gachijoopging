import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet, Button, Checkbox, Txt, space } from 'design-system/src';

type AgreementFieldsProps = {
  termsChecked: boolean;
  onTermsChange: (checked: boolean) => void;
  privacyChecked: boolean;
  onPrivacyChange: (checked: boolean) => void;
  optionalChecked: boolean;
  onOptionalChange: (checked: boolean) => void;
  disabled?: boolean;
};

type SheetTarget = { title: string } | null;

/**
 * 1-3·1-4 가 공유하는 필수/선택 동의 목록. 실제 약관·개인정보 전문·버전·저장 계약은
 * 미결(screens/sign-up.md·1-4-nickname.md)이라 "내용 보기" 는 준비 중 안내만 보여 준다.
 */
export function AgreementFields({
  termsChecked,
  onTermsChange,
  privacyChecked,
  onPrivacyChange,
  optionalChecked,
  onOptionalChange,
  disabled,
}: AgreementFieldsProps) {
  const [sheet, setSheet] = useState<SheetTarget>(null);

  return (
    <View style={{ gap: space.sm }}>
      <AgreementRow
        label="필수 약관 동의"
        checked={termsChecked}
        onChange={onTermsChange}
        onViewDetail={() => setSheet({ title: '이용약관' })}
        disabled={disabled}
      />
      <AgreementRow
        label="필수 개인정보 동의"
        checked={privacyChecked}
        onChange={onPrivacyChange}
        onViewDetail={() => setSheet({ title: '개인정보 처리방침' })}
        disabled={disabled}
      />
      <AgreementRow
        label="선택 동의 항목"
        checked={optionalChecked}
        onChange={onOptionalChange}
        onViewDetail={() => setSheet({ title: '선택 동의 항목' })}
        disabled={disabled}
      />
      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)} title={sheet?.title}>
        <Txt variant="body" tone="muted">
          전문은 아직 준비 중이에요. 최종본이 확정되면 이 화면에서 확인할 수 있어요.
        </Txt>
      </BottomSheet>
    </View>
  );
}

function AgreementRow({
  label,
  checked,
  onChange,
  onViewDetail,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onViewDetail: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Checkbox label={label} checked={checked} onChange={onChange} disabled={disabled} />
      <Button label="내용 보기" variant="ghost" size="sm" onPress={onViewDetail} disabled={disabled} />
    </View>
  );
}
