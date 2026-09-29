// 화면 6-1 · docs/screens/6-1-report.md
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  Card,
  Field,
  Screen,
  SelectRow,
  Thumb,
  Txt,
  space,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { usePreventBack } from '../src/auth/usePreventBack';
import {
  MEMO_MAX,
  REASONS,
  canSubmitReport,
  clearReportDraft,
  editReportDraft,
  memoCounter,
  reportDraftFor,
  reportRequestId,
  submitOutcome,
  type ReportReason,
} from '../src/report/report';

const api: ApiClient = createMockClient({ delayMs: 300 });

type Params = {
  targetType: string;
  targetId: string;
  /** 아래는 진입 화면이 이미 받아 둔 표시용 미리보기다. 서버는 제출 때 실제 대상을 다시 확인한다 */
  nickname?: string;
  photoUrl?: string;
  text?: string;
  thumbUrl?: string;
};

export default function ReportScreen() {
  const { targetType, targetId, nickname, photoUrl, text, thumbUrl } = useLocalSearchParams<Params>();
  const [reason, setReason] = useState<ReportReason | null>(() => reportDraftFor(targetType, targetId).reason);
  const [memo, setMemo] = useState(() => reportDraftFor(targetType, targetId).memo);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [banner, setBanner] = useState<{ message: string; duplicate: boolean } | null>(null);
  const navigation = useNavigation();
  usePreventBack(sending);

  const edit = (next: { reason: ReportReason | null; memo: string }) => {
    setReason(next.reason);
    setMemo(next.memo);
    editReportDraft(targetType, targetId, next);
  };

  const submit = async () => {
    // 같은 프레임의 연속 탭은 sending 이 반영되기 전이라 ref 로 막는다
    if (inFlight.current || !canSubmitReport(reason, memo)) return;
    inFlight.current = true;
    setSending(true);
    setBanner(null);
    let error: unknown = null;
    try {
      const id = reportRequestId(targetType, targetId, Crypto.randomUUID);
      await api.mutate('POST /reports', {
        id,
        targetType,
        targetId,
        reason,
        ...(memo.trim() ? { memo } : {}),
      });
    } catch (e) {
      error = e;
    }
    const outcome = submitOutcome(error);
    if (outcome.kind === 'done') {
      clearReportDraft(targetType, targetId);
      return backWithFlash(outcome.message);
    }
    inFlight.current = false;
    setSending(false);
    setBanner({ message: outcome.message, duplicate: outcome.kind === 'duplicate' });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  // 이 화면은 사라지므로 접수 안내는 진입한 화면이 flash 로 받아 띄운다
  const backWithFlash = (flash: string) => {
    const { routes, index } = navigation.getState() ?? { routes: [], index: 0 };
    const prev = routes[index - 1];
    if (!prev) return back();
    router.dismissTo({ pathname: `/${prev.name}` as never, params: { ...(prev.params as object), flash } });
  };
  const counter = memoCounter(memo);
  const quote = targetType !== 'USER' && !(targetType === 'POST' && thumbUrl) && text ? `"${text}"` : null;
  const submittable = canSubmitReport(reason, memo);

  return (
    <Screen scroll>
      <AppHeader title="신고하기" onBack={back} backDisabled={sending} />

      {nickname ? (
        <Card accessible accessibilityLabel={['신고 대상', nickname, quote].filter(Boolean).join(', ')} style={{ gap: space.sm }}>
          <Txt variant="caption" tone="muted">신고 대상</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={nickname} uri={photoUrl || undefined} size="sm" decorative />
            <View style={{ flex: 1, gap: space.xs }}>
              <Txt variant="body" bold>{nickname}</Txt>
              {quote ? (
                <Txt variant="caption" tone="muted" numberOfLines={2}>{quote}</Txt>
              ) : null}
            </View>
            {targetType === 'POST' && thumbUrl ? (
              <Thumb uri={thumbUrl} size="sm" />
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Txt variant="caption">신고 사유를 선택해 주세요.</Txt>
        <Txt variant="caption">신고 사실은 상대에게 표시되지 않아요.</Txt>
      </View>

      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {REASONS.map((r) => (
          <SelectRow
            key={r.value}
            title={r.label}
            selected={reason === r.value}
            disabled={sending}
            onPress={() => edit({ reason: r.value, memo })}
          />
        ))}
      </View>

      {reason === 'OTHER' ? (
        <View style={{ gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <Txt variant="label">상세 메모</Txt>
            <Txt variant="label" tone="error">*필수</Txt>
          </View>
          <Field
            multiline
            maxLines={4}
            maxLength={MEMO_MAX}
            editable={!sending}
            placeholder="어떤 문제가 있었는지 알려 주세요"
            accessibilityLabel="상세 메모, 기타 사유일 때 필수"
            value={memo}
            onChangeText={(v) => edit({ reason, memo: v })}
          />
          {counter ? (
            <Txt
              variant="micro"
              tone={counter.full ? 'error' : 'faint'}
              style={{ alignSelf: 'flex-end' }}
              accessibilityLabel={`${memo.length}자, ${MEMO_MAX}자 중`}
            >
              {counter.text}
            </Txt>
          ) : null}
        </View>
      ) : null}

      {banner ? <Banner tone={banner.duplicate ? 'warn' : 'danger'}>{banner.message}</Banner> : null}

      {banner?.duplicate ? (
        <Button label="돌아가기" variant="ghost" onPress={back} fullWidth />
      ) : (
        <Button
          label="신고 제출"
          fullWidth
          loading={sending}
          disabled={!submittable || sending}
          accessibilityLabel={sending ? '신고 접수 중' : '신고 제출'}
          onPress={submit}
        />
      )}
    </Screen>
  );
}
