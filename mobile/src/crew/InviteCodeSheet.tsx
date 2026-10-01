import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Banner, BottomSheet, Button, Dialog, Txt, space, tracking } from 'design-system/src';
import { createMockClient, type ApiClient } from '../api/client';
import { spelledCode } from './crew';

const api: ApiClient = createMockClient({ delayMs: 300 });

/** 크루 정보 화면의 초대 코드 시트. 코드 보기·복사·공유, 크루장은 새로 만들기 */
export function InviteCodeSheet({
  visible,
  code,
  isLeader,
  onClose,
  onReissued,
  onMessage,
}: {
  visible: boolean;
  code: string;
  isLeader: boolean;
  onClose: () => void;
  onReissued: (code: string) => void;
  onMessage: (text: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [failed, setFailed] = useState(false);

  // 지난번 실패를 다시 연 시트에 남기지 않는다
  useEffect(() => {
    if (visible) setFailed(false);
  }, [visible]);

  // 시트가 스낵바를 덮으므로 복사하면 닫고 알린다
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    onClose();
    onMessage('초대 코드를 복사했어요.');
  };

  // 공유 시트를 닫은 것과 보낸 것을 구별할 수 없어 결과를 알리지 않는다
  const share = () => Share.share({ message: `가치줍깅 크루 초대 코드: ${code}` }).catch(() => {});

  const reissue = async () => {
    setConfirming(false);
    setReissuing(true);
    setFailed(false);
    // 결과는 시트 안에 보인다. 시트가 화면의 스낵바를 덮는다. 성공은 바뀐 코드가 알린다
    try {
      const { data } = await api.mutate('POST /crew/invite-code');
      onReissued(data.inviteCode);
    } catch {
      setFailed(true);
    } finally {
      setReissuing(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} dismissible={!reissuing} title="초대 코드">
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <Txt variant="body" tone="muted">크루원에게 이 코드를 보내세요</Txt>
          <View accessible accessibilityLabel={`초대 코드 ${spelledCode(code)}`} accessibilityLiveRegion="polite">
            <Txt variant="counter" style={{ letterSpacing: tracking.code }}>{code}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
            <Button label="코드 복사" size="lg" icon="content-copy" fullWidth style={{ flex: 1 }} disabled={reissuing} accessibilityLabel="초대 코드 복사" onPress={copy} />
            <Button label="공유" variant="soft" size="lg" icon="share-variant-outline" fullWidth style={{ flex: 1 }} disabled={reissuing} accessibilityLabel="초대 코드 공유" onPress={share} />
          </View>
          {failed ? <Banner tone="danger">새 코드를 만들지 못했어요. 다시 시도해 주세요.</Banner> : null}
          {isLeader ? (
            <Button label="새 코드 만들기" variant="ghost" size="md" loading={reissuing} disabled={reissuing} onPress={() => setConfirming(true)} />
          ) : null}
        </View>
      </BottomSheet>

      <Dialog
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="새 초대 코드를 만들까요?"
        actions={
          <>
            <Button label="기존 코드 유지" variant="ghost" size="md" onPress={() => setConfirming(false)} />
            <Button label="새 코드 만들기" size="md" onPress={reissue} />
          </>
        }
      >
        <Txt variant="body">지금 코드는 더 이상 쓸 수 없어요. 이미 받은 가입 신청은 그대로 남아요.</Txt>
      </Dialog>
    </>
  );
}
