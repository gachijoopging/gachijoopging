import { useEffect, useState } from 'react';
import { Screen, Txt, Card, Tile, Banner, Loading, Avatar } from 'design-system/src';
import { createMockClient, type ApiClient } from '../../src/api/client';
import { MOCKS } from '../../src/api/mocks.generated';

type Home = (typeof MOCKS)['GET /crew/home']['data'];

const api: ApiClient = createMockClient({ delayMs: 300 });

export default function HomeScreen() {
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get('GET /crew/home')
      .then((res) => setHome(res.data))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Screen><Banner tone="danger">홈을 불러오지 못했어요</Banner></Screen>;
  if (!home) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Txt variant="display">{home.crew.name}</Txt>
      <Txt variant="caption" tone="muted">화면 2-1 — 목 데이터 (openapi.yaml example)</Txt>

      <Card>
        <Txt variant="section">최근 7일 우리 크루가 주운 쓰레기</Txt>
        <Txt variant="counter">{home.last7d.crewItems}</Txt>
      </Card>

      <Tile>
        <Txt variant="section">최근 7일 내가 주운 쓰레기</Txt>
        <Txt variant="metric">{home.last7d.myItems}</Txt>
      </Tile>

      <Card>
        <Txt variant="section">지금 활동 중인 크루원 {home.live.count}</Txt>
        {home.live.users.map((u) => (
          <Avatar key={u.id} size="sm" name={u.nickname} uri={u.photoUrl ?? undefined} />
        ))}
      </Card>

      <Txt variant="caption" tone="muted">
        최근 {home.character.windowDays}일 {home.character.items}개 · 목표 {home.character.goalCount} · 단계 {home.character.stage}
      </Txt>
    </Screen>
  );
}
