import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet, Button, Field, space } from 'design-system/src';
import { exportFileName, exportRangeError, fetchCrewCsv, formatDateInput } from './export';

/** 크루장 전용 CSV 기간 선택 시트. 3-11 크루원 관리에서 연다 */
export function ExportSheet({ visible, onClose, onFailed }: { visible: boolean; onClose: () => void; onFailed: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = exportRangeError(from, to);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      const file = new File(Paths.cache, exportFileName(from, to));
      file.write(await fetchCrewCsv(from, to));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: '기록 내보내기' });
      onClose();
    } catch {
      onFailed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busy} title="기록 내보내기">
      <View style={{ gap: space.md }}>
        <Field label="시작일" placeholder="2026-09-01" value={from} onChangeText={(v) => setFrom(formatDateInput(v))} keyboardType="number-pad" maxLength={10} editable={!busy} />
        <Field label="종료일" placeholder="2026-09-30" value={to} onChangeText={(v) => setTo(formatDateInput(v))} keyboardType="number-pad" maxLength={10} editable={!busy} error={error ?? undefined} />
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="닫기" variant="ghost" size="md" disabled={busy} onPress={onClose} />
          <Button label="CSV 내보내기" size="md" loading={busy} disabled={busy} onPress={submit} />
        </View>
      </View>
    </BottomSheet>
  );
}
