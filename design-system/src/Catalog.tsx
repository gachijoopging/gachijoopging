import { useCallback, useState } from 'react';
import { ImageBackground, View } from 'react-native';
import { space, size as sizes } from '../tokens/spacing.ts';
import { radius } from '../tokens/radius.ts';
import { fontSize, lineHeight } from '../tokens/typography.ts';
import { shadow, borderWidth } from '../tokens/elevation.ts';
import { useTheme, depth, type Scheme } from './theme.tsx';
import { Txt } from './components/Text.tsx';
import { Icon, type IconName } from './components/Icon.tsx';
import { IconButton } from './components/IconButton.tsx';
import { AppHeader } from './components/AppHeader.tsx';
import { Button, CaptureButton } from './components/Button.tsx';
import { Chip } from './components/Chip.tsx';
import { Card, Tile } from './components/Card.tsx';
import { Field } from './components/Input.tsx';
import { Checkbox, Switch } from './components/Toggle.tsx';
import { NumberStepper } from './components/NumberStepper.tsx';
import { Avatar } from './components/Avatar.tsx';
import { Badge, Dot } from './components/Badge.tsx';
import { Banner } from './components/Banner.tsx';
import { BottomSheet, Dialog } from './components/Sheet.tsx';
import { Tabs, BottomNav } from './components/Tabs.tsx';
import { ListRow, SelectRow } from './components/ListRow.tsx';
import { Progress } from './components/Progress.tsx';
import { Loading, Spinner, EmptyState, ErrorState } from './components/States.tsx';
import { Thumb } from './components/Thumb.tsx';
import { Screen } from './components/Screen.tsx';
import { Snackbar } from './components/Snackbar.tsx';
import { LinkText } from './components/LinkText.tsx';
import { IconCircle } from './components/IconCircle.tsx';
import { MetricSplit } from './components/MetricSplit.tsx';
import { BarChart } from './components/BarChart.tsx';

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.md, paddingTop: space['3xl'] }}>
      <View
        style={{
          gap: space.xs,
          borderBottomWidth: borderWidth.hairline,
          borderBottomColor: colors.border,
          paddingBottom: space.sm,
        }}
      >
        <Txt variant="title">{title}</Txt>
        {note ? <Txt variant="caption" tone="hint">{note}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
      {children}
    </View>
  );
}

const SWATCHES = [
  'bg', 'surface', 'ink', 'inkMuted', 'inkHint', 'deep', 'lime', 'yellow',
  'greenStrong', 'orange', 'border', 'track', 'neutral', 'softChip',
  'warnBg', 'warnInk', 'dangerBg', 'dangerInk', 'infoBg', 'infoInk',
  'error', 'onError', 'kakao',
] as const;

const ICONS: IconName[] = [
  'camera', 'map-marker', 'account-group', 'bell', 'heart', 'trash-can',
  'recycle', 'walk', 'chat', 'cog', 'magnify', 'plus',
];

const SWATCH_WIDTH = 78;

export function Catalog({ scheme, onScheme }: { scheme: Scheme; onScheme: (s: Scheme) => void }) {
  const { colors, shadows } = useTheme();
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [snack, setSnack] = useState(false);
  const [tab, setTab] = useState<'all' | 'friends'>('all');
  const [nav, setNav] = useState<'home' | 'feed' | 'start' | 'meet' | 'me'>('home');
  const [picked, setPicked] = useState('a');
  const [chip, setChip] = useState(false);
  const [toggle, setToggle] = useState(true);
  const [checked, setChecked] = useState(false);
  const [participants, setParticipants] = useState(4);
  const [text, setText] = useState('');

  const noop = useCallback(() => {}, []);
  const closeSnack = useCallback(() => setSnack(false), []);

  return (
    <>
      <Screen scroll>
        <View style={{ gap: space.sm }}>
          <Txt variant="display">가치줍깅 디자인 시스템</Txt>
          <Txt variant="body" tone="muted">
            안드로이드에서 이식한 토큰과 그 위에 세운 컴포넌트입니다. 아래 토글로 두 팔레트를 비교하세요.
          </Txt>
          <Tabs
            items={[{ value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }] as const}
            value={scheme}
            onChange={onScheme}
          />
        </View>

        <Section title="색상" note="역할 기준. 전체 목록은 tokens/colors.ts 와 대비 명세 페이지에 있습니다.">
          <Row>
            {SWATCHES.map((k) => (
              // 셀에 고정 폭을 주지 않습니다 — 글자 배율을 키우면 라벨이 칸보다
              // 넓어져 단어 중간에서 쪼개집니다. 칩만 고정하고 셀은 내용에 맞춥니다.
              <View key={k} style={{ gap: 4 }}>
                <View
                  style={{
                    width: SWATCH_WIDTH,
                    height: 44,
                    borderRadius: radius.field,
                    backgroundColor: colors[k],
                    borderWidth: borderWidth.hairline,
                    borderColor: colors.border,
                  }}
                />
                <Txt variant="micro" tone="hint">{k}</Txt>
              </View>
            ))}
          </Row>
        </Section>

        <Section title="글꼴과 텍스트 크기" note="Pretendard. 크기 / 행간. 시스템 글자 크기를 그대로 따릅니다.">
          {(Object.keys(fontSize) as Array<keyof typeof fontSize>).map((k) => (
            <View key={k} style={{ gap: 2, paddingVertical: space.xs }}>
              <Txt variant="micro" tone="hint">{k} · {fontSize[k]}/{lineHeight[k]}</Txt>
              <Txt variant={k}>다시 쓰는 우리 동네</Txt>
            </View>
          ))}
        </Section>

        <Section title="여백과 간격" note="4 그리드. 붙어 있음 4 · 관련됨 8 · 분리됨 12.">
          {(Object.entries(space) as Array<[string, number]>).map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Txt variant="micro" tone="hint" style={{ minWidth: 64 }}>{k}</Txt>
              <View style={{ width: v, height: 14, borderRadius: 3, backgroundColor: colors.lime }} />
              <Txt variant="micro" tone="hint">{v}</Txt>
            </View>
          ))}
        </Section>

        <Section title="모서리 반경">
          <Row>
            {(Object.entries(radius) as Array<[string, number]>).map(([k, v]) => (
              <View key={k} style={{ gap: 4 }}>
                <View
                  style={{
                    width: 84,
                    height: 60,
                    borderRadius: Math.min(v, 30),
                    backgroundColor: colors.surface,
                    borderWidth: borderWidth.hairline,
                    borderColor: colors.border,
                  }}
                />
                <Txt variant="micro" tone="hint">{k} · {v}</Txt>
              </View>
            ))}
          </Row>
        </Section>

        <Section
          title="그림자와 테두리"
          note="Android 8.1 이하에서는 boxShadow 가 안 그려져 depth() 가 elevation 으로 대체합니다. 아래 견본도 컴포넌트와 같은 분기를 씁니다."
        >
          <Row>
            {(Object.keys(shadow.light) as Array<keyof typeof shadow.light>).map((k) => (
              <View key={k} style={{ gap: 6, alignItems: 'center' }}>
                <View
                  style={{
                    width: 96,
                    height: 52,
                    borderRadius: radius.tile,
                    backgroundColor: colors.surface,
                    ...depth(k, shadows[k]),
                  }}
                />
                <Txt variant="micro" tone="hint">{k}</Txt>
              </View>
            ))}
          </Row>
        </Section>

        <Section title="아이콘" note="Material Design Icons. 기본은 장식이라 스크린리더에서 숨겨집니다.">
          <Row>
            {ICONS.map((n) => (
              <View key={n} style={{ minWidth: 64, alignItems: 'center', gap: 4 }}>
                <Icon name={n} size={26} />
                <Txt variant="micro" tone="hint">{n}</Txt>
              </View>
            ))}
          </Row>
        </Section>

        <Section title="아이콘 버튼과 화면 헤더" note="아이콘만으로 동작할 때는 반드시 접근성 라벨을 제공합니다.">
          <Row>
            <IconButton icon="arrow-left" label="뒤로 가기" onPress={noop} />
            <IconButton icon="cog" label="설정" tone="surface" onPress={noop} />
            <IconButton icon="plus" label="추가" tone="lime" onPress={noop} />
          </Row>
          <AppHeader title="모임 설정" onBack={noop} />
          <AppHeader
            title="프로필"
            subtitle="이웃에게 보이는 정보"
            action={<IconButton icon="cog" label="프로필 설정" tone="tint" onPress={noop} />}
          />
        </Section>

        <Section title="버튼" note="주 채움은 라임→노랑 가로 그라데이션. 안드로이드에서는 리플로 반응합니다.">
          <Row>
            <Button label="줍깅 시작" onPress={noop} />
            <Button label="모임 만들기" variant="soft" onPress={noop} />
            <Button label="카카오로 로그인" variant="kakao" onPress={noop} />
            <Button label="닫기" variant="ghost" onPress={noop} />
            <Button label="선택" variant="deep" onPress={noop} />
            <Button label="삭제" variant="danger" onPress={noop} />
            <Button label="삭제 취소" variant="ghostDanger" onPress={noop} />
            <Button label="사진 위 버튼" variant="translucent" onPress={noop} />
          </Row>
          <Row>
            <Button label="아이콘" icon="camera" size="md" onPress={noop} />
            <Button label="처리 중" loading size="md" onPress={noop} />
            <Button label="비활성" disabled size="md" onPress={noop} />
            <Button label="12개" size="sm" onPress={noop} />
          </Row>
          <Row>
            <LinkText label="비밀번호를 잊으셨나요?" tone="muted" onPress={noop} />
            <LinkText label="회원가입" bold onPress={noop} />
            <LinkText label="비활성 링크" disabled onPress={noop} />
          </Row>
          <Button label="가로로 꽉 차는 버튼" fullWidth onPress={noop} />
          <Row>
            <CaptureButton onPress={noop} />
            <Txt variant="caption" tone="hint">촬영 버튼 {sizes.captureFab}</Txt>
          </Row>
        </Section>

        <Section title="칩" note="시각 높이는 32 지만 터치 영역은 hitSlop 으로 48 을 지킵니다.">
          <Row>
            <Chip label="라임" tone="lime" />
            <Chip label="딥" tone="deep" />
            <Chip label="소프트" tone="soft" />
            <Chip label="서피스" tone="surface" />
            <Chip label="중립" tone="neutral" />
            <Chip label="정보" tone="info" icon="information" />
            <Chip label="주의" tone="warn" icon="alert" />
            <Chip label="위험" tone="danger" />
            <Chip label="눌러서 선택" selected={chip} onPress={() => setChip((v) => !v)} />
            <Chip label="비활성" onPress={noop} disabled />
          </Row>
          <ImageBackground
            source={require('../assets/legacy/trash-pet.jpg')}
            resizeMode="cover"
            style={{ height: 140, justifyContent: 'flex-end', padding: space.md, borderRadius: radius.tile, overflow: 'hidden' }}
          >
            <Chip label="방금 찍은 쓰레기" tone="overlay" />
          </ImageBackground>
        </Section>

        <Section title="입력창" note="화면이 KeyboardAvoidingView 를 쓰므로 키보드가 올라와도 가리지 않습니다.">
          <Field label="닉네임" placeholder="두 글자 이상" value={text} onChangeText={setText} hint="이웃에게 보이는 이름입니다" />
          <Field
            label="비밀번호"
            placeholder="8자 이상"
            secureTextEntry
            error="8자 이상 입력해 주세요"
            endAdornment={<IconButton icon="eye" label="비밀번호 보기" onPress={noop} />}
          />
          <Field label="한마디" placeholder="오늘 줍깅은 어땠나요?" multiline />
          <Field placeholder="메시지 입력" multiline maxLines={4} />
          <Field label="동네" value="역삼동" editable={false} />
        </Section>

        <Section title="토글과 체크박스">
          <Switch label="모임 알림 받기" value={toggle} onValueChange={setToggle} />
          <Switch label="비활성 알림" value={false} onValueChange={noop} disabled />
          <Checkbox label="이용약관에 동의합니다" checked={checked} onChange={setChecked} />
          <Checkbox label="선택할 수 없는 항목" checked onChange={noop} disabled />
        </Section>

        <Section title="수량 스테퍼" note="최소·최대값은 호출자가 정하고, 컴포넌트는 화면 안에서만 값을 제한합니다.">
          <NumberStepper label="참여 인원" min={1} max={8} value={participants} onChange={setParticipants} />
        </Section>

        <Section title="카드">
          <Card>
            <Txt variant="section" bold>이번 주 기록</Txt>
            <Txt variant="body" tone="muted">3번 나가서 12개를 주웠어요.</Txt>
          </Card>
          <Card onPress={noop} accessibilityLabel="크루 만들기">
            <Txt variant="section" bold>누르는 카드</Txt>
            <Txt variant="caption" tone="hint">카드 전체가 버튼입니다. 안에 다른 조작을 두지 않습니다.</Txt>
          </Card>
          <Card onPress={noop} disabled>
            <Txt variant="section" bold>비활성 카드</Txt>
          </Card>
          <Card>
            <MetricSplit
              items={[{ value: '27', label: '개수' }, { value: '42분', label: '시간' }, { value: '3.1km', label: '거리' }]}
              accessibilityLabel="개수 27개, 시간 42분, 거리 3.1킬로미터"
            />
          </Card>
          <Card>
            <Txt variant="caption" tone="muted">9월 7일 ~ 9월 13일</Txt>
            <BarChart values={[40, 0, 77, 120, 64, null, null]} labels={['월', '화', '수', '목', '금', '토', '일']} accessibilityLabel="이번 주, 총 301개" />
          </Card>
          <Card>
            <MetricSplit
              divider="dashed"
              items={[{ value: '42:10', label: '활동 시간', muted: true }, { value: '3.1km', label: '이동 거리' }, { value: '4,210', label: '걸음' }, { value: '12', label: '줍기' }]}
              accessibilityLabel="활동 시간 42분 10초, 이동 거리 3.1킬로미터, 걸음 4210, 줍기 12개"
            />
          </Card>
          <Row>
            <Tile style={{ flex: 1, minWidth: 140 }}>
              <Txt variant="micro" tone="hint">내가 주운</Txt>
              <Txt variant="counter" style={{ color: colors.orange }}>128</Txt>
            </Tile>
            <Tile tone="surface" style={{ flex: 1, minWidth: 140 }}>
              <Txt variant="micro" tone="hint">걸은 거리</Txt>
              <Txt variant="metric">3.4 km</Txt>
            </Tile>
          </Row>
        </Section>

        <Section title="아바타와 배지">
          <Row>
            <Avatar name="백관열" size="lg" />
            <Avatar name="가치줍깅" size="xl" />
            <Avatar name="서상혁" size="md" />
            <Avatar name="김영현" size="sm" />
            <Avatar name="이웃" size="md" ring />
            <Avatar name="탈퇴한 크루원" size="md" withdrawn />
            <Thumb uri={null} size="sm" />
            <Thumb uri={null} size="md" />
            <Badge label={3} />
            <Badge label="새 소식" tone="deep" />
            <Badge label="12" tone="lime" />
            <Badge label="스팸·도배" tone="warn" />
            <Dot />
            <Dot tone="deep" />
          </Row>
          <Card>
            <Row>
              <IconCircle icon="lightning-bolt" tone="deep" />
              <IconCircle icon="bell-outline" tone="tint" />
              <IconCircle icon="chat-outline" tone="neutral" />
              <IconCircle icon="play" tone="lime" />
              <IconCircle icon="trash-can-outline" tone="orange" />
              <IconCircle icon="map-marker" tone="surface" size="sm" />
              <IconCircle icon="sprout" tone="tint" size="lg" label="활동 기록" />
            </Row>
          </Card>
        </Section>

        <Section title="배너">
          <Banner tone="info" title="동네가 설정됐어요">역삼동 이웃들의 모임이 보입니다.</Banner>
          <Banner tone="warn">위치 권한이 꺼져 있어 지도를 그릴 수 없습니다.</Banner>
          <Banner tone="danger" title="업로드 실패">사진 3장 중 1장을 올리지 못했습니다.</Banner>
          <Banner tone="neutral">크루장이 승인하면 크루원이 돼요.</Banner>
        </Section>

        <Section title="진행바">
          <Progress value={0.62} label="이번 주 목표" />
          <Txt variant="caption" tone="hint">주 목표까지 62%</Txt>
        </Section>

        <Section title="모달 · 시트 · 스낵바" note="스낵바는 되돌릴 수 있는 결과, 대화상자는 중단이 필요한 결정에만.">
          <Row>
            <Button label="바텀시트 열기" variant="soft" size="md" onPress={() => setSheet(true)} />
            <Button label="대화상자 열기" variant="soft" size="md" onPress={() => setDialog(true)} />
            <Button label="스낵바 띄우기" variant="soft" size="md" onPress={() => setSnack(true)} />
          </Row>
        </Section>

        <Section title="탭과 리스트" note="긴 목록은 List(FlatList) 를 씁니다 — 아래는 짧은 예시라 행을 직접 놓았습니다.">
          <Tabs items={[{ value: 'all', label: '전체' }, { value: 'friends', label: '친구' }] as const} value={tab} onChange={setTab} />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            <ListRow title="알림" subtitle="모임 초대와 댓글" icon="bell" onPress={noop} />
            <ListRow title="차단 목록" icon="account-cancel" onPress={noop} />
            <ListRow title="비밀번호 재설정" icon="lock-reset" onPress={noop} disabled />
            <ListRow title="로그아웃" icon="logout" onPress={noop} divider={false} />
          </Card>
          <SelectRow title="역삼동" subtitle="현재 위치" selected={picked === 'a'} onPress={() => setPicked('a')} />
          <SelectRow title="논현동" selected={picked === 'b'} onPress={() => setPicked('b')} />
          <SelectRow title="선택할 수 없음" selected={false} onPress={noop} disabled />
          <BottomNav
            items={[
              { value: 'home', label: '홈', icon: 'home' },
              { value: 'feed', label: '피드', icon: 'view-list' },
              { value: 'start', label: '줍깅', icon: 'plus' },
              { value: 'meet', label: '모임', icon: 'account-group' },
              { value: 'me', label: '내정보', icon: 'account' },
            ] as const}
            value={nav}
            onChange={setNav}
            startAction={{ icon: 'plus', label: '시작', onPress: noop }}
          />
        </Section>

        <Section title="로딩 · 빈 상태 · 오류 상태" note="빈 상태와 오류는 다음에 할 일을 함께 말합니다.">
          <Card padded={false} style={{ padding: space.sm }}>
            <Loading />
          </Card>
          <Row>
            <Spinner />
            <Txt variant="section" bold>기록을 저장하고 있어요…</Txt>
          </Row>
          <EmptyState
            icon="map-marker-off"
            title="아직 기록이 없어요"
            description="첫 줍깅을 시작하면 여기에 쌓입니다."
            actionLabel="줍깅 시작"
            onAction={noop}
          />
          <ErrorState onRetry={noop} />
          <ErrorState
            title="크루장만 가입 신청을 관리할 수 있어요."
            description={null}
            icon="lock-outline"
            actionLabel="크루 정보로"
            onRetry={noop}
          />
        </Section>

        <Snackbar
          visible={snack}
          message="기록을 지웠어요"
          actionLabel="되돌리기"
          onAction={closeSnack}
          onDismiss={closeSnack}
        />
      </Screen>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="모임에 참여할까요?">
        <Txt variant="body" tone="muted">토요일 오전 10시 · 역삼동 · 4명 참여 중</Txt>
        <Button label="참여하기" fullWidth onPress={() => setSheet(false)} />
        <Button label="닫기" variant="ghost" fullWidth onPress={() => setSheet(false)} />
      </BottomSheet>

      <Dialog
        visible={dialog}
        onClose={() => setDialog(false)}
        title="모임을 나갈까요?"
        actions={
          <>
            <Button label="그대로 두기" variant="ghost" size="md" onPress={() => setDialog(false)} />
            <Button label="나가기" variant="danger" size="md" onPress={() => setDialog(false)} />
          </>
        }
      >
        <Txt variant="body" tone="muted">나가면 대화 내용을 볼 수 없습니다.</Txt>
      </Dialog>

    </>
  );
}
