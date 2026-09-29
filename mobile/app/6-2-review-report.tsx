import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  Snackbar,
  Txt,
  size,
  space,
  useRipple,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import type { MOCKS } from '../src/api/mocks.generated';
import { monthDay } from '../src/crew/crew';
import { memberActionOutcome } from '../src/crew/manage';
import { reasonLabel, reportActions, resolveOutcome, targetLabel, withoutKickedUser, type ReportAction } from '../src/report/report';

type Report = (typeof MOCKS)['GET /crew/reports']['data']['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

const CONFIRM: Record<ReportAction, { title: (r: Report) => string; body: string; label: string }> = {
  DISMISS: { title: () => '이 신고를 기각할까요?', body: '대상은 그대로 유지되고 신고만 처리돼요.', label: '기각' },
  DELETE: { title: () => '신고 대상을 삭제할까요?', body: '삭제한 게시물·댓글·메시지는 되돌릴 수 없어요.', label: '대상 삭제' },
  KICK: {
    title: (r) => `${r.targetPreview} 님을 크루에서 추방할까요?`,
    body: '활동 기록과 크루 합산은 남아요. 유효한 초대 코드로 다시 가입 신청할 수 있어요.',
    label: '추방',
  },
};

export default function ReviewReportScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [reports, setReports] = useState<readonly Report[] | null>(null);
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ report: Report; action: ReportAction } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async (mode: 'quiet' | 'pull') => {
    if (mode === 'pull') setRefreshing(true);
    const [meRes, listRes] = await Promise.allSettled([api.get('GET /users/me'), api.get('GET /crew/reports')]);
    setRefreshing(false);
    if (meRes.status === 'fulfilled') setIsLeader(!!meRes.value.data.membership.crew?.isLeader);
    if (listRes.status === 'fulfilled') {
      setReports(listRes.value.data.items);
      setFailed(false);
    } else if (listRes.reason instanceof ApiError && listRes.reason.code === 'FORBIDDEN') {
      setIsLeader(false);
    } else {
      setFailed(true);
    }
  }, []);

  useFocusEffect(useCallback(() => void load('quiet'), [load]));
  const acting = useRef(false);

  const act = async () => {
    // 같은 프레임의 연속 탭은 confirm 이 비워지기 전이라 ref 로 막는다
    if (!confirm || acting.current) return;
    acting.current = true;
    const { report, action } = confirm;
    setConfirm(null);
    setBusyId(report.id);
    let error: unknown = null;
    try {
      if (action === 'KICK') await api.mutate('DELETE /crew/members/{userId}', { userId: report.targetId });
      else await api.mutate('POST /crew/reports/{reportId}', { reportId: report.id, result: action });
    } catch (e) {
      error = e;
    }
    setBusyId(null);
    acting.current = false;
    if (action === 'KICK') {
      const outcome = memberActionOutcome('kick', report.targetPreview, error);
      if (outcome.message) setSnackbar(outcome.message);
      if (outcome.next === 'removeRow') setReports((prev) => prev && withoutKickedUser(prev, report.targetId));
      if (outcome.next === 'removeRow' || outcome.next === 'reload') void load('quiet');
      return;
    }
    const outcome = resolveOutcome(action, error);
    if (outcome.removeRow) setReports((prev) => prev?.filter((r) => r.id !== report.id) ?? prev);
    if (outcome.denied) setIsLeader(false);
    if (outcome.message) setSnackbar(outcome.message);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/2-3-notifications'));

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="신고 처리" onBack={back} />

      {isLeader === false ? (
        <ErrorState
          title="크루장만 신고를 처리할 수 있어요."
          description={null}
          icon="lock-outline"
          actionLabel="크루 정보로"
          onRetry={() => router.replace('/3-2-crew-info')}
        />
      ) : !reports || isLeader == null ? (
        failed ? (
          <ErrorState title="신고를 불러오지 못했어요" onRetry={() => load('quiet')} />
        ) : (
          <Loading label="신고를 불러오고 있어요" />
        )
      ) : reports.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="대기 중인 신고가 없어요"
          description="새 신고가 들어오면 여기에서 처리할 수 있어요."
        />
      ) : (
        <>
          <Txt variant="section" accessibilityRole="header">{`불러온 대기 신고 ${reports.length}건`}</Txt>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}
          {reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              open={openId === r.id}
              busy={busyId === r.id}
              locked={busyId != null && busyId !== r.id}
              onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
              onAct={(action) => setConfirm({ report: r, action })}
            />
          ))}
        </>
      )}

      <Dialog visible={confirm != null} onClose={() => setConfirm(null)} title={confirm ? CONFIRM[confirm.action].title(confirm.report) : ''}>
        <Txt variant="body">{confirm ? CONFIRM[confirm.action].body : ''}</Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="취소" variant="ghost" size="md" onPress={() => setConfirm(null)} />
          <Button
            label={confirm ? CONFIRM[confirm.action].label : ''}
            variant={confirm?.action === 'DISMISS' ? 'primary' : 'danger'}
            size="md"
            onPress={act}
          />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

const ACTION_LABEL: Record<ReportAction, { label: string; a11y: string }> = {
  DISMISS: { label: '기각', a11y: '신고 기각' },
  DELETE: { label: '대상 삭제', a11y: '신고 대상 삭제, 되돌릴 수 없음' },
  KICK: { label: '크루원 추방', a11y: '크루원 추방' },
};

function ReportRow({
  report,
  open,
  busy,
  locked,
  onToggle,
  onAct,
}: {
  report: Report;
  open: boolean;
  busy: boolean;
  locked: boolean;
  onToggle: () => void;
  onAct: (action: ReportAction) => void;
}) {
  const ripple = useRipple();
  const kind = targetLabel(report.targetType);
  const reason = reasonLabel(report.reason);
  const date = monthDay(report.createdAt);
  const [dismiss, resolve] = reportActions(report.targetType);
  return (
    <Card style={{ gap: space.md }}>
      <Pressable
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${kind}, ${reason}, ${date} 접수, 신고 상세 ${open ? '접기' : '보기'}, ${report.targetPreview}`}
        onPress={onToggle}
        disabled={locked}
        style={{ gap: space.xs, minHeight: size.minTouch }}
      >
        <Txt variant="body" bold>{kind}</Txt>
        <Txt variant="caption" tone="muted" numberOfLines={open ? undefined : 2}>{report.targetPreview}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Badge label={reason} tone="warn" />
          <Txt variant="micro" tone="faint">{date}</Txt>
        </View>
      </Pressable>

      {open ? (
        <View accessible style={{ gap: space.sm }}>
          <Txt variant="label" tone="muted">신고 내용</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar name={report.reporter.nickname} uri={report.reporter.photoUrl ?? undefined} size="sm" />
            <Txt variant="caption">{`신고자 ${report.reporter.nickname}`}</Txt>
          </View>
          <Txt variant="caption" tone={report.memo ? 'ink' : 'muted'}>{report.memo ?? '상세 메모 없음'}</Txt>
        </View>
      ) : null}

      {open ? (
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            label={ACTION_LABEL[dismiss].label}
            variant="ghost"
            style={{ flex: 1 }}
            disabled={busy || locked}
            accessibilityLabel={ACTION_LABEL[dismiss].a11y}
            onPress={() => onAct(dismiss)}
          />
          <Button
            label={ACTION_LABEL[resolve].label}
            style={{ flex: 1 }}
            loading={busy}
            disabled={busy || locked}
            accessibilityLabel={ACTION_LABEL[resolve].a11y}
            onPress={() => onAct(resolve)}
          />
        </View>
      ) : null}
    </Card>
  );
}
