import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  Avatar,
  BottomSheet,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  ListRow,
  Loading,
  NumberStepper,
  Screen,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, createMockClient, type ApiClient } from '../src/api/client';
import { CREW_INTRO_MAX, CREW_NAME_MAX, crewFormErrors, crewPatch, type CrewForm } from '../src/crew/crew-edit';
import { usePreventBack } from '../src/auth/usePreventBack';

type Original = { name: string; intro: string; goalCount: number; photoUrl: string | null };

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function EditCrewScreen() {
  const navigation = useNavigation();
  const [original, setOriginal] = useState<Original | null>(null);
  const [form, setForm] = useState<CrewForm | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [goalValid, setGoalValid] = useState(true);
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const saved = useRef(false);
  usePreventBack(saving);

  const load = async () => {
    setFailed(false);
    try {
      const { data } = await api.get('GET /crew');
      if (!data.isLeader) return setDenied(true);
      const next = { name: data.name, intro: data.intro ?? '', goalCount: data.goalCount, photoUrl: data.photoUrl };
      setOriginal(next);
      setForm({ name: next.name, intro: next.intro, goalCount: next.goalCount });
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = original && form && goalValid ? crewPatch(original, form) : null;
  const errors = form ? crewFormErrors(form) : {};
  const dirty =
    !!original &&
    !!form &&
    (form.name !== original.name || form.intro !== original.intro || form.goalCount !== original.goalCount || form.photoMediaId !== undefined);

  // 저장하지 않은 변경이 있으면 떠나기 전에 묻는다
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (saved.current || !dirty) return;
        e.preventDefault();
        setPendingLeave(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation, dirty],
  );

  const update = (next: Partial<CrewForm>) => setForm((prev) => (prev ? { ...prev, ...next } : prev));

  const save = async () => {
    if (saving || !patch) return;
    setSaving(true);
    try {
      await api.mutate('PATCH /crew', patch);
      saved.current = true;
      // 3-2 는 포커스 때 다시 받는다
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FORBIDDEN') setDenied(true);
      else if (e instanceof ApiError && e.code === 'CONFLICT') setNameError('이미 사용 중인 크루 이름이에요.');
      else if (e instanceof ApiError && e.code === 'VALIDATION') setNameError('크루 이름을 다시 확인해 주세요.');
      else if (form?.photoMediaId) setSnackbar('사진은 준비됐어요. 저장을 다시 시도해 주세요.');
      else setSnackbar('크루 정보를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const photoGone = form?.photoMediaId === null;
  const hasPhoto = !!original?.photoUrl && !photoGone;

  return (
    <Screen scroll>
      <AppHeader title="크루 정보 수정" onBack={() => router.back()} backDisabled={saving} />

      {denied ? (
        <EmptyState
          icon="lock-outline"
          title="크루장만 크루 정보를 수정할 수 있어요."
          actionLabel="크루 정보로"
          onAction={() => router.back()}
        />
      ) : !form || !original ? (
        failed ? (
          <ErrorState title="크루 정보를 불러오지 못했어요" onRetry={load} />
        ) : (
          <Loading label="크루 정보를 불러오고 있어요" />
        )
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Avatar name={form.name || original.name} uri={hasPhoto ? original.photoUrl ?? undefined : undefined} size="xl" />
            <Button
              label="대표 사진 변경"
              variant="ghost"
              size="sm"
              accessibilityLabel={hasPhoto ? '크루 대표 사진 변경' : '대표 사진 없음, 사진 추가'}
              disabled={saving}
              onPress={() => setPhotoSheet(true)}
            />
          </View>

          <Field
            label="크루 이름"
            accessibilityLabel={`크루 이름, 2자에서 ${CREW_NAME_MAX}자`}
            value={form.name}
            onChangeText={(name) => {
              update({ name });
              setNameError(undefined);
            }}
            error={nameError ?? errors.name}
            maxLength={CREW_NAME_MAX + 10}
            editable={!saving}
            returnKeyType="next"
          />
          <Field
            label="소개"
            accessibilityLabel={`크루 소개, ${CREW_INTRO_MAX}자까지`}
            placeholder="크루를 소개해 주세요."
            value={form.intro}
            onChangeText={(intro) => update({ intro })}
            error={errors.intro}
            hint={`${form.intro.trim().length} / ${CREW_INTRO_MAX}`}
            multiline
            editable={!saving}
          />
          <NumberStepper
            label="14일 목표"
            value={form.goalCount}
            min={1}
            onChange={(goalCount) => update({ goalCount })}
            onValidityChange={setGoalValid}
            disabled={saving}
          />
          <Txt variant="caption" tone="muted">{`14일에 ${form.goalCount}개`}</Txt>

          <View style={{ flex: 1 }} />
          <Button
            label="변경사항 저장"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!patch}
            onPress={save}
          />
        </>
      )}

      <BottomSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="대표 사진">
        {/* ponytail: 카메라·사진 선택 모듈(expo-image-picker)이 아직 없다. 들어오면 POST /media purpose CREW → photoMediaId */}
        <ListRow icon="camera-outline" title="카메라로 촬영" disabled onPress={() => {}} />
        <ListRow icon="image-outline" title="사진 선택" disabled onPress={() => {}} />
        {hasPhoto ? (
          <ListRow
            icon="delete-outline"
            title="사진 삭제"
            chevron={false}
            onPress={() => {
              update({ photoMediaId: null });
              setPhotoSheet(false);
            }}
          />
        ) : null}
      </BottomSheet>

      <Dialog visible={pendingLeave != null} onClose={() => setPendingLeave(null)} title="변경사항을 버릴까요?">
        <Txt variant="body" tone="muted">저장하지 않은 변경사항은 사라져요.</Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button label="계속 수정" variant="ghost" size="md" onPress={() => setPendingLeave(null)} />
          <Button
            label="버리기"
            variant="danger"
            size="md"
            onPress={() => {
              const leave = pendingLeave;
              setPendingLeave(null);
              saved.current = true;
              leave?.();
            }}
          />
        </View>
      </Dialog>

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
