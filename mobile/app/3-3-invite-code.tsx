import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Share, View } from 'react-native';
import {
  AppHeader,
  Banner,
  Button,
  Card,
  Dialog,
  ErrorState,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { spelledCode } from '../src/crew/crew';

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function InviteCodeScreen() {
  const [code, setCode] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async (mode: 'first' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    try {
      const { data } = await api.get('GET /crew');
      setCode(data.inviteCode);
      setIsLeader(data.isLeader);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => void load('first'), [load]);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setSnackbar('초대 코드를 복사했어요.');
  };

  // 공유 시트를 닫은 것과 보낸 것을 구별할 수 없어 결과를 알리지 않는다
  const share = () => code && Share.share({ message: `가치줍깅 크루 초대 코드: ${code}` }).catch(() => {});

  const reissue = async () => {
    setConfirming(false);
    setReissuing(true);
    try {
      const { data } = await api.mutate('POST /crew/invite-code');
      setCode(data.inviteCode);
      setSnackbar('새 초대 코드를 만들었어요.');
    } catch {
      setSnackbar('새 코드를 만들지 못했어요. 다시 시도해 주세요.');
    } finally {
      setReissuing(false);
    }
  };

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="초대 코드" backDisabled={reissuing} onBack={() => router.back()} />

      {!code ? (
        failed ? (
          <ErrorState title="초대 코드를 불러오지 못했어요" onRetry={() => load('first')} />
        ) : (
          <Loading label="초대 코드를 불러오고 있어요" />
        )
      ) : (
        <>
          <View style={{ gap: space.xs }}>
            <Txt variant="display">크루원에게 이 코드를 보내세요</Txt>
            <Txt variant="caption" tone="muted">크루장이 승인하면 크루원이 돼요.</Txt>
          </View>

          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          <Card style={{ alignItems: 'center', gap: space.lg }}>
            <Pressable
              onLongPress={copy}
              disabled={reissuing}
              accessibilityLabel={`초대 코드 ${spelledCode(code)}`}
              accessibilityHint="길게 누르면 복사해요"
            >
              <Txt variant="counter" style={{ letterSpacing: 6 }}>{code}</Txt>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
              <Button
                label="코드 복사"
                size="lg"
                icon="content-copy"
                fullWidth
                style={{ flex: 1 }}
                disabled={reissuing}
                accessibilityLabel="초대 코드 복사"
                onPress={copy}
              />
              <Button
                label="공유"
                variant="soft"
                size="lg"
                icon="share-variant-outline"
                fullWidth
                style={{ flex: 1 }}
                disabled={reissuing}
                accessibilityLabel="초대 코드 공유"
                onPress={share}
              />
            </View>
          </Card>

          <View style={{ gap: space.sm }}>
            <Banner tone="warn">
              코드를 재발급하면 기존 코드는 새 가입 신청에 사용할 수 없어요. 이미 접수된 신청은 유지돼요.
            </Banner>
            {isLeader ? (
              <Button
                label="새 코드 만들기"
                variant="ghost"
                size="md"
                loading={reissuing}
                disabled={reissuing}
                onPress={() => setConfirming(true)}
              />
            ) : null}
          </View>
        </>
      )}

      <Dialog visible={confirming} onClose={() => setConfirming(false)} title="새 초대 코드를 만들까요?">
        <Txt variant="body" tone="muted">
          기존 코드는 새 신청에 사용할 수 없어요. 이미 접수된 신청은 유지돼요. 새로 신청할 사람에게 새 코드를 알려 주세요.
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={() => setConfirming(false)} />
          <Button label="새 코드 만들기" size="md" onPress={reissue} />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
