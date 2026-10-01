// 화면 6-1 · docs/screens/6-1-report.md
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  Card,
  Field,
  ErrorState,
  Loading,
  Screen,
  SelectRow,
  Thumb,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
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
  validReportTarget,
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
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [memo, setMemo] = useState('');
  const [memoLeft, setMemoLeft] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ message: string; duplicate: boolean } | null>(null);
  const navigation = useNavigation();
  const busy = useRef(false);
  const validTarget = validReportTarget(targetType, targetId);
  usePreventBack(sending);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (busy.current) event.preventDefault();
  }), [navigation]);

  useEffect(() => {
    let cancelled = false;
    setAccountId(null);
    setDenied(false);
    setLoadFailed(false);
    if (!validTarget) return;
    api.get('GET /users/me').then(({ data }) => {
      if (cancelled) return;
      if (data.membership.status !== 'MEMBER' || data.membership.crew?.isLeader) { setDenied(true); return; }
      const draft = reportDraftFor(data.id, targetType, targetId);
      setReason(draft.reason);
      setMemo(draft.memo);
      setAccountId(data.id);
    }).catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [targetType, targetId, validTarget]);

  const edit = (next: { reason: ReportReason | null; memo: string }) => {
    if (!accountId || busy.current || denied || !validTarget) return;
    if (next.reason !== reason) setMemoLeft(false);
    setReason(next.reason);
    setMemo(next.memo);
    editReportDraft(accountId, targetType, targetId, next);
  };

  const submit = async () => {
    if (busy.current || !accountId || denied || !validTarget || !canSubmitReport(reason, memo)) return;
    busy.current = true;
    setSending(true);
    setBanner(null);
    let error: unknown = null;
    try {
      const id = reportRequestId(accountId, targetType, targetId, Crypto.randomUUID);
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
    busy.current = false;
    if (error instanceof ApiError && (error.code === 'FORBIDDEN' || error.code === 'NO_CREW')) {
      setSending(false);
      setDenied(true);
      return;
    }
    const outcome = submitOutcome(error);
    if (outcome.kind === 'done') {
      clearReportDraft(accountId, targetType, targetId);
      return backWithFlash(outcome.message);
    }
    setSending(false);
    setBanner({ message: outcome.message, duplicate: outcome.kind === 'duplicate' });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const backWithFlash = (flash: string) => {
    const { routes, index } = navigation.getState() ?? { routes: [], index: 0 };
    const prev = routes[index - 1];
    if (!prev) return back();
    router.dismissTo({ pathname: `/${prev.name}` as never, params: { ...(prev.params as object), flash } });
  };
  const counter = memoCounter(memo);
  const quote = targetType !== 'USER' && !(targetType === 'POST' && thumbUrl) && text ? `"${text}"` : null;
  const submittable = canSubmitReport(reason, memo);

  if (!validTarget || denied) return <Screen><AppHeader title="신고하기" onBack={back} /><ErrorState title={denied ? '크루원만 신고할 수 있어요.' : '신고 대상을 확인할 수 없어요.'} actionLabel="돌아가기" onRetry={back} /></Screen>;
  if (!accountId) return <Screen><AppHeader title="신고하기" onBack={back} />{loadFailed ? <ErrorState title="신고 권한을 확인하지 못했어요." actionLabel="돌아가기" onRetry={back} /> : <Loading label="신고 권한을 확인하는 중" />}</Screen>;

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
            onBlur={() => setMemoLeft(true)}
            error={memoLeft && !memo.trim() ? '기타 사유는 메모가 필요해요.' : undefined}
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
          label="신고 보내기"
          fullWidth
          loading={sending}
          disabled={!submittable || sending}
          accessibilityLabel={sending ? '신고 보내는 중' : '신고 보내기'}
          onPress={submit}
        />
      )}
    </Screen>
  );
}
