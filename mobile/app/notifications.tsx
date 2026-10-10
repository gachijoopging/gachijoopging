// 화면 2-3 · docs/screens/2-3-notifications.md
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl, View } from 'react-native';
import {
  AppHeader,
  Badge,
  Banner,
  Button,
  Dot,
  EmptyState,
  ErrorState,
  IconCircle,
  ListRow,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
  type IconName,
  characterEmpty,
} from 'design-system/src';
import { createMockClient, type ApiClient } from '../src/api/client';
import { MOCKS } from '../src/api/mocks.generated';
import { resolveDestination, type Me } from '../src/auth/destination';
import {
  markAllRead,
  markRead,
  markUnread,
  notificationDestination,
  relativeTime,
  type ReadState,
} from '../src/notifications/notifications';

type Page = (typeof MOCKS)['GET /notifications']['data'];
type Item = Page['items'][number];

const api: ApiClient = createMockClient({ delayMs: 300 });

const ICON: Record<string, IconName> = {
  JOIN_REQUEST: 'account-plus-outline',
  CREW_JOINED: 'account-check-outline',
  JOIN_APPROVED: 'check-circle-outline',
  JOIN_REJECTED: 'close-circle-outline',
  NOTICE: 'bullhorn-outline',
  COMMENT: 'comment-outline',
  CHAT: 'chat-outline',
  ACTIVITY_STARTED: 'run',
  REPORT: 'flag-outline',
  POST_REMOVED: 'delete-outline',
  REPORT_RESOLVED: 'flag-checkered',
};

export default function NotificationsScreen() {
  const [read, setRead] = useState<ReadState<Item> | null>(null);
  const [pending, setPending] = useState<Page['pending'] | null>(null);
  const [membership, setMembership] = useState<Me['membership']>({ status: 'MEMBER' });
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [notifyOff, setNotifyOff] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async (mode: 'first' | 'pull') => {
    const generation = ++request.current;
    if (mode === 'pull') setRefreshing(true);
    const [list, count] = await Promise.allSettled([
      api.get('GET /notifications'),
      api.get('GET /notifications/unread-count'),
    ]);
    if (generation !== request.current) return;
    setRefreshing(false);
    if (list.status === 'rejected') {
      // 당겨서 실패는 스낵바만 — 값은 그대로 두고 연결 배너까지 겹치지 않는다
      if (mode === 'pull') setSnackbar('새로고침에 실패했어요');
      else setFailed(true);
      return;
    }
    setFailed(false);
    setPending(list.value.data.pending);
    // 안 읽음 수를 못 받으면 부제를 비운다(null)
    setRead({ items: [...list.value.data.items], unreadCount: count.status === 'fulfilled' ? count.value.data.count : null });
  }, []);

  useEffect(() => {
    api.get('GET /users/me').then((res) => setMembership(res.data.membership)).catch(() => {});
  }, [load]);

  // 설정에서 권한을 켜고 돌아오면 배너를 걷는다
  useFocusEffect(
    useCallback(() => {
      void load('first');
      Notifications.getPermissionsAsync().then((p) => setNotifyOff(!p.granted)).catch(() => {});
    }, [load]),
  );

  const open = (item: Item) => {
    if (read && item.unread) {
      setRead((s) => s && markRead(s, item.id));
      // 그 사이 다른 항목·모두 읽음이 바꾼 상태를 덮지 않도록 이 항목만 되돌린다
      api.mutate('POST /notifications/read', { ids: [item.id] }).catch(() => {
        setRead((s) => s && markUnread(s, item.id));
        setSnackbar('읽음 처리에 실패했어요');
      });
    }
    const destination = notificationDestination(item, membership);
    if (destination) router.push(destination);
    else if (item.detail) setSnackbar(item.detail);
  };

  const readAll = async () => {
    if (!read) return;
    setMarkingAll(true);
    try {
      await api.mutate('POST /notifications/read');
      setRead((s) => s && markAllRead(s));
    } catch {
      setSnackbar('읽음 처리에 실패했어요');
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = read?.unreadCount;
  const hasUnread = unreadCount != null ? unreadCount > 0 : !!read?.items.some((i) => i.unread);
  const subtitle = unreadCount == null ? undefined : unreadCount > 0 ? `읽지 않음 ${unreadCount}` : '모두 읽었어요';

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} />}>
      <AppHeader title="알림" subtitle={subtitle} onBack={() => (router.canGoBack() ? router.back() : router.replace(resolveDestination({ profileComplete: true, membership })))} />

      {notifyOff ? (
        <Banner
          tone="warn"
          action={{ label: '설정 열기', accessibilityLabel: '알림 설정 열기', onPress: () => Linking.openSettings() }}
        >
          알림 권한이 꺼져 있어 새 알림을 받을 수 없어요
        </Banner>
      ) : null}

      {!read ? (
        failed ? <ErrorState onRetry={() => load('first')} /> : <Loading label="불러오는 중…" />
      ) : (
        <>
          {failed ? <Banner tone="warn">인터넷 연결을 확인해 주세요.</Banner> : null}

          {pending && (pending.joinRequests > 0 || pending.reports > 0) ? (
            <View style={{ gap: space.xs }}>
              <Txt variant="caption" bold>처리 대기</Txt>
              {pending.joinRequests > 0 ? (
                <ListRow
                  title={`가입 신청 ${pending.joinRequests}건이 기다리고 있어요`}
                  left={<IconCircle icon="account-plus-outline" tone="tint" size="sm" />}
                  right={<Badge label={pending.joinRequests} tone="deep" />}
                  chevron
                  accessibilityLabel={`가입 신청 ${pending.joinRequests}건이 기다리고 있어요, 가입 신청 관리로 이동`}
                  onPress={() => router.push('/crew/join-requests')}
                />
              ) : null}
              {pending.reports > 0 ? (
                <ListRow
                  title={`신고 ${pending.reports}건이 기다리고 있어요`}
                  left={<IconCircle icon="flag-outline" tone="tint" size="sm" />}
                  right={<Badge label={pending.reports} tone="danger" />}
                  chevron
                  accessibilityLabel={`신고 ${pending.reports}건이 기다리고 있어요, 신고 처리로 이동`}
                  onPress={() => router.push('/crew/reports')}
                />
              ) : null}
            </View>
          ) : null}

          {read.items.length === 0 ? (
            <EmptyState
              image={characterEmpty.notification}
              title="알림이 없어요"
            />
          ) : (
            <>
              <View style={{ alignItems: 'flex-end' }}>
                <Button
                  label="모두 읽음"
                  icon="check"
                  loading={markingAll}
                  variant="ghost"
                  size="sm"
                  disabled={!hasUnread || markingAll}
                  onPress={readAll}
                />
              </View>
              <View>
                {read.items.map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.title}
                    subtitle={[item.detail, relativeTime(item.createdAt)].filter(Boolean).join(' · ')}
                    left={<IconCircle icon={ICON[item.type] ?? 'bell-outline'} tone="tint" size="sm" />}
                    right={item.unread ? <Dot tone="deep" size={7} /> : undefined}
                    emphasized={item.unread}
                    chevron
                    accessibilityLabel={[item.unread ? '안 읽음' : '', item.title, item.detail, relativeTime(item.createdAt)]
                      .filter(Boolean)
                      .join(', ')}
                    onPress={() => open(item)}
                  />
                ))}
              </View>
              {/* ponytail: nextCursor 로 다음 장 받기는 목이 한 장뿐이라 백엔드 연결 때 붙인다 */}
              <Txt variant="micro" tone="muted">
                목록을 열어 보는 것만으로는 읽음 처리되지 않아요. 항목을 선택하거나 모두 읽음을 눌러 주세요.
              </Txt>
            </>
          )}
        </>
      )}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}

