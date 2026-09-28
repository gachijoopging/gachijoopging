import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import { usePreventBack } from '../src/auth/usePreventBack';
import {
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  clearNoticeDraft,
  noticeDraft,
  noticeFormErrors,
  noticeSubmit,
  saveNoticeDraft,
  type NoticeDraftKey,
  type NoticeForm,
} from '../src/crew/notice-edit';

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function EditNoticeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const [key, setKey] = useState<NoticeDraftKey | null>(null);
  const [original, setOriginal] = useState<NoticeForm | null>(null);
  const [form, setForm] = useState<NoticeForm | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof NoticeForm, boolean>>>({});
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const busy = useRef(false);
  usePreventBack(saving);

  const load = async () => {
    setFailed(false);
    try {
      const { data: me } = await api.get('GET /users/me');
      const crew = me.membership.crew;
      if (!crew?.isLeader) return setDenied(true);
      const draftKey = { meId: me.id, crewId: crew.id, noticeId: id ?? null };
      let base: NoticeForm | null = null;
      if (id) {
        const { data } = await api.get('GET /notices/{noticeId}', { noticeId: id });
        base = { title: data.title, body: data.body };
      }
      setKey(draftKey);
      setOriginal(base);
      setForm(noticeDraft(draftKey) ?? base ?? { title: '', body: '' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') return goneBack();
      setFailed(true);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const goneBack = () => {
    setSnackbar('삭제된 공지예요.');
    setTimeout(() => router.dismissTo('/3-5-notices'), 1200);
  };

  const change = (next: Partial<NoticeForm>) => {
    if (!form || !key) return;
    const value = { ...form, ...next };
    setForm(value);
    saveNoticeDraft(key, value);
  };

  const submit = form ? noticeSubmit(original, form) : null;
  const errors = form ? noticeFormErrors(form) : {};

  const save = async () => {
    // 버튼·키보드 저장이 같은 진행 중 요청을 공유한다
    if (busy.current || !submit || !key) return;
    busy.current = true;
    setSaving(true);
    try {
      if (id) {
        await api.mutate('PATCH /notices/{noticeId}', { noticeId: id, ...submit });
        clearNoticeDraft(key);
        router.back();
      } else {
        const { data } = await api.mutate('POST /crew/notices', submit);
        clearNoticeDraft(key);
        router.replace({ pathname: '/3-6-notice-detail', params: { id: data.id } });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FORBIDDEN') setDenied(true);
      else if (e instanceof ApiError && e.code === 'NOT_FOUND') goneBack();
      else setSnackbar('공지를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <AppHeader title={editing ? '공지 수정' : '공지 작성'} onBack={() => router.back()} backDisabled={saving} />

      {denied ? (
        <EmptyState
          icon="lock-outline"
          title="크루장만 공지를 작성할 수 있어요."
          actionLabel="공지 목록으로"
          onAction={() => router.dismissTo('/3-5-notices')}
        />
      ) : !form ? (
        failed ? (
          <ErrorState title="공지를 불러오지 못했어요" onRetry={load} />
        ) : (
          <Loading label="공지를 불러오고 있어요" />
        )
      ) : (
        <>
          <View style={{ gap: space.xs }}>
            <Field
              label="제목"
              accessibilityLabel={`공지 제목, ${NOTICE_TITLE_MAX}자까지, ${form.title.length}자 입력됨`}
              placeholder="공지 제목을 입력해 주세요."
              value={form.title}
              onChangeText={(title) => change({ title })}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              error={touched.title ? errors.title : undefined}
              maxLength={NOTICE_TITLE_MAX}
              editable={!saving}
            />
            <Txt variant="micro" tone="hint" style={{ textAlign: 'right' }}>{`${form.title.length} / ${NOTICE_TITLE_MAX}`}</Txt>
          </View>

          <View style={{ gap: space.xs }}>
            <Field
              label="내용"
              accessibilityLabel={`공지 내용, ${NOTICE_BODY_MAX}자까지, ${form.body.length}자 입력됨`}
              placeholder="크루원에게 알릴 내용을 입력해 주세요."
              value={form.body}
              onChangeText={(body) => change({ body })}
              onBlur={() => setTouched((t) => ({ ...t, body: true }))}
              error={touched.body ? errors.body : undefined}
              maxLength={NOTICE_BODY_MAX}
              multiline
              editable={!saving}
            />
            <Txt variant="micro" tone="hint" style={{ textAlign: 'right' }}>{`${form.body.length} / ${NOTICE_BODY_MAX}`}</Txt>
          </View>

          <View style={{ flex: 1 }} />
          <Button
            label={editing ? '변경사항 저장' : '공지 올리기'}
            size="lg"
            fullWidth
            loading={saving}
            disabled={!submit}
            onPress={save}
          />
        </>
      )}

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
