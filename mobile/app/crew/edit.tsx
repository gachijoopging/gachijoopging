// 화면 3-10 · docs/screens/3-10-edit-crew.md
import { mediaFile } from '../../src/api/media';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, View, type TextInput } from 'react-native';
import {
  AppHeader,
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Card,
  Dialog,
  ErrorState,
  Field,
  ListRow,
  Loading,
  NumberStepper,
  Screen,
  SelectRow,
  Snackbar,
  Txt,
  space,
} from 'design-system/src';
import { ApiError, type ApiClient } from '../../src/api/client';
import { createApiClient } from '../../src/api/config';
import { CREW_INTRO_MAX, CREW_NAME_MAX, crewChanged, crewFormErrors, crewPatch, openingOverflows, opensCrew, type CrewForm } from '../../src/crew/crew-edit';
import { REGIONS, regionName, type JoinPolicy, type Region } from '../../src/crew/region';
import { usePreventBack } from '../../src/auth/usePreventBack';

type Original = {
  name: string;
  intro: string;
  goalCount: number;
  region: Region;
  joinPolicy: JoinPolicy;
  photoUrl: string | null;
  memberCount: number;
  pendingJoinRequests: number;
};

const POLICIES: { value: JoinPolicy; title: string; subtitle: string }[] = [
  { value: 'OPEN', title: '공개', subtitle: '승인 없이 바로 가입' },
  { value: 'APPROVAL', title: '비공개', subtitle: '크루장이 승인해야 가입' },
];

const api: ApiClient = createApiClient({ delayMs: 300 });

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
  const [regionSheet, setRegionSheet] = useState(false);
  const [openDialog, setOpenDialog] = useState<'confirm' | 'full' | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mediaId: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const saved = useRef(false);
  const busy = useRef(false);
  const introRef = useRef<TextInput>(null);
  const [touched, setTouched] = useState<{ name?: boolean; intro?: boolean }>({});
  const touch = (field: 'name' | 'intro') => setTouched((t) => ({ ...t, [field]: true }));
  usePreventBack(saving || uploading);

  const load = async () => {
    setFailed(false);
    try {
      const { data } = await api.get('GET /crew');
      if (!data.isLeader) return setDenied(true);
      const next: Original = {
        name: data.name,
        intro: data.intro ?? '',
        goalCount: data.goalCount,
        region: data.region,
        joinPolicy: data.joinPolicy,
        photoUrl: data.photoUrl,
        memberCount: data.memberCount,
        pendingJoinRequests: data.pendingJoinRequests,
      };
      setOriginal(next);
      setForm({ name: next.name, intro: next.intro, goalCount: next.goalCount, region: next.region, joinPolicy: next.joinPolicy });
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = original && form && goalValid ? crewPatch(original, form) : null;
  const errors = form ? crewFormErrors(form) : {};
  const dirty = !!original && !!form && crewChanged(original, form);

  // 저장하지 않은 변경이 있으면 떠나기 전에 묻는다
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (saved.current || denied || !dirty) return;
        e.preventDefault();
        setPendingLeave(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation, dirty, denied],
  );

  const update = (next: Partial<CrewForm>) => setForm((prev) => (prev ? { ...prev, ...next } : prev));

  const opening = !!original && !!patch && opensCrew(original, patch);

  const readCounts = () =>
    api.get('GET /crew').then(
      ({ data }) => ({ memberCount: data.memberCount, pendingJoinRequests: data.pendingJoinRequests }),
      () => null,
    );

  const requestSave = async () => {
    if (!original || !patch || busy.current) return;
    if (!opening) return void save();
    // 정원 초과 안내를 따라 신청을 정리하고 돌아왔을 수 있어 인원은 저장 직전에 다시 읽는다
    busy.current = true;
    setSaving(true);
    const counts = (await readCounts()) ?? original;
    busy.current = false;
    setSaving(false);
    setOriginal((o) => (o ? { ...o, ...counts } : o));
    setOpenDialog(openingOverflows(counts.memberCount, counts.pendingJoinRequests) ? 'full' : 'confirm');
  };

  const save = async () => {
    // 같은 프레임의 연속 탭은 saving 상태가 반영되기 전이라 ref 로 막는다
    if (busy.current || !patch || !original) return;
    busy.current = true;
    setOpenDialog(null);
    setSaving(true);
    try {
      await api.mutate('PATCH /crew', patch);
      saved.current = true;
      // 응답에 자동 가입 인원이 없고 추방 이력 신청은 남으므로 가입 인원을 세어 말하지 않는다
      const flash = opening ? '공개 크루로 바꿨어요.' : '크루 정보를 저장했어요.';
      // 떠나는 화면은 다시 그리지 않는다. 전환 중에 입력·스테퍼가 되살아나면 안드로이드 Fabric 이
      // 사라지는 뷰를 다시 붙이려다 "child already has a parent" 로 죽는다
      router.dismissTo({ pathname: '/crew/members', params: { flash } });
      return;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FORBIDDEN') setDenied(true);
      else if (e instanceof ApiError && e.code === 'CREW_FULL') setOpenDialog('full');
      else if (e instanceof ApiError && e.code === 'CREW_NAME_TAKEN') setNameError('이미 사용 중인 크루 이름이에요.');
      else if (e instanceof ApiError && e.code === 'VALIDATION') setNameError('크루 이름을 다시 확인해 주세요.');
      else if (form?.photoMediaId) setSnackbar('사진은 준비됐어요. 저장을 다시 시도해 주세요.');
      else setSnackbar('크루 정보를 저장하지 못했어요. 다시 시도해 주세요.');
    }
    busy.current = false;
    setSaving(false);
  };

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    setUploading(true);
    try {
      // 계약이 multipart/form-data 다. RN 의 FormData 는 { uri, name, type } 을 파일로 올린다
      const body = new FormData();
      body.append('mediaId', Crypto.randomUUID());
      body.append('purpose', 'CREW');
      body.append('file', await mediaFile(asset.uri) as unknown as Blob);
      const { data } = await api.mutate('POST /media', body);
      setPhoto({ uri: asset.uri, mediaId: data.mediaId });
      update({ photoMediaId: data.mediaId });
    } catch {
      setSnackbar('사진을 올리지 못했어요. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
    }
  };

  const pick = async (source: 'camera' | 'library') => {
    setPhotoSheet(false);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setCameraDenied(true);
    }
    setCameraDenied(false);
    // 사진 선택은 OS 사진 선택기라 앨범 전체 권한을 묻지 않는다
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) await upload(result.assets[0]);
  };

  const photoGone = form?.photoMediaId === null;
  const photoUri = photo && form?.photoMediaId === photo.mediaId ? photo.uri : photoGone ? undefined : original?.photoUrl ?? undefined;
  const hasPhoto = !!photoUri;

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }}>
      <AppHeader title="크루 정보 수정" onBack={() => router.back()} backDisabled={saving} />

      {denied ? (
        <ErrorState
          title="크루장만 크루 정보를 수정할 수 있어요."
          description={null}
          icon="lock-outline"
          actionLabel="크루 정보로"
          onRetry={() => router.dismissTo('/crew/members')}
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
            <Avatar name={form.name || original.name} uri={photoUri} size="xl" />
            <Button
              label="대표 사진 변경"
              variant="ghost"
              size="sm"
              accessibilityLabel={hasPhoto ? '크루 대표 사진 변경' : '대표 사진 없음, 사진 추가'}
              loading={uploading}
              disabled={saving}
              onPress={() => setPhotoSheet(true)}
            />
          </View>
          {cameraDenied ? (
            <Banner tone="warn" action={{ label: '설정으로 이동', onPress: () => void Linking.openSettings() }}>
              사진 권한을 허용해 주세요.
            </Banner>
          ) : null}

          <Field
            label="크루 이름"
            accessibilityLabel={`크루 이름, 2자에서 ${CREW_NAME_MAX}자`}
            value={form.name}
            onChangeText={(name) => {
              update({ name });
              setNameError(undefined);
            }}
            error={nameError ?? (touched.name ? errors.name : undefined)}
            onBlur={() => touch('name')}
            maxLength={CREW_NAME_MAX + 10}
            editable={!saving}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => introRef.current?.focus()}
          />
          <Field
            label="소개"
            accessibilityLabel={`크루 소개, ${CREW_INTRO_MAX}자까지`}
            ref={introRef}
            placeholder="크루를 소개해 주세요."
            value={form.intro}
            onChangeText={(intro) => update({ intro })}
            error={touched.intro ? errors.intro : undefined}
            onBlur={() => touch('intro')}
            multiline
            editable={!saving}
          />
          <View style={{ gap: space.xs }}>
            <Txt variant="label">활동 지역</Txt>
            <Card style={{ paddingVertical: 0 }}>
              <ListRow
                title={regionName(form.region)}
                accessibilityLabel={`활동 지역, ${regionName(form.region)}, 바꾸기`}
                disabled={saving}
                divider={false}
                onPress={() => setRegionSheet(true)}
              />
            </Card>
          </View>
          <View style={{ gap: space.xs }} accessibilityLabel="가입 방식">
            <Txt variant="label">가입 방식</Txt>
            {POLICIES.map((p) => (
              <SelectRow
                key={p.value}
                title={p.title}
                subtitle={p.subtitle}
                selected={form.joinPolicy === p.value}
                disabled={saving}
                onPress={() => update({ joinPolicy: p.value })}
              />
            ))}
          </View>
          <NumberStepper
            label="14일 목표"
            value={form.goalCount}
            min={1}
            onChange={(goalCount) => update({ goalCount })}
            onValidityChange={setGoalValid}
            disabled={saving}
          />

          <View style={{ flex: 1 }} />
          <Button
            label="변경사항 저장"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!patch || uploading}
            onPress={requestSave}
          />
        </>
      )}

      <BottomSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="대표 사진">
        <ListRow icon="camera-outline" title="카메라로 촬영" onPress={() => void pick('camera')} />
        <ListRow icon="image-outline" title="사진 선택" onPress={() => void pick('library')} />
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

      <BottomSheet visible={regionSheet} onClose={() => setRegionSheet(false)} title="활동 지역">
        {REGIONS.map(([code, label]) => (
          <ListRow
            key={code}
            title={label}
            chevron={false}
            emphasized={code === form?.region}
            onPress={() => {
              update({ region: code });
              setRegionSheet(false);
            }}
          />
        ))}
      </BottomSheet>

      <Dialog
        visible={openDialog === 'confirm'}
        onClose={() => setOpenDialog(null)}
        title="공개 크루로 바꿀까요?"
        actions={
          <>
            <Button label="그대로 두기" variant="ghost" size="md" onPress={() => setOpenDialog(null)} />
            <Button label="공개로 바꾸기" size="md" onPress={() => void save()} />
          </>
        }
      >
        <Txt variant="body">
          {`이제부터 누구나 승인 없이 바로 가입해요.${original?.pendingJoinRequests ? ` 지금 기다리는 가입 신청 ${original.pendingJoinRequests}건도 바로 가입돼요. 내보낸 적 있는 사람의 신청은 그대로 남아요.` : ''}`}
        </Txt>
      </Dialog>

      <Dialog
        visible={openDialog === 'full'}
        onClose={() => setOpenDialog(null)}
        title="공개로 바꿀 수 없어요"
        actions={
          <>
            <Button label="닫기" variant="ghost" size="md" onPress={() => setOpenDialog(null)} />
            <Button
              label="가입 신청 관리로"
              size="md"
              onPress={() => {
                setOpenDialog(null);
                router.push('/crew/join-requests');
              }}
            />
          </>
        }
      >
        <Txt variant="body">
          {`지금 크루원 ${original?.memberCount ?? 0}명과 기다리는 신청 ${original?.pendingJoinRequests ?? 0}건을 합하면 정원(50명)을 넘어요. 가입 신청을 정리한 뒤 다시 바꿔 주세요.`}
        </Txt>
      </Dialog>

      <Dialog
        visible={pendingLeave != null}
        onClose={() => setPendingLeave(null)}
        title="변경사항을 버릴까요?"
        actions={
          <>
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
          </>
        }
      />

      <Snackbar visible={snackbar != null} message={snackbar ?? ''} onDismiss={() => setSnackbar(null)} />
    </Screen>
  );
}
