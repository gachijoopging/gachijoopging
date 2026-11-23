import { ApiError } from '../api/client';
import {
  POST_PHOTO_MAX,
  EMPTY_DRAFT,
  parseDraft,
  lockSetting,
  accountGate,
  activeDaysGrid,
  activityTitle,
  canPost,
  leaveConfirm,
  leaveFailure,
  movePhoto,
  photosToUpload,
  profilePatch,
  readyMediaIds,
  safetyRows,
} from './profile';

describe('5-4 안전 시트 행', () => {
  test('크루원은 신고·차단만 본다', () => {
    expect(safetyRows({ viewerIsLeader: false, blocked: false })).toEqual(['report', 'block']);
  });

  test('크루장은 신고 없이 차단·추방·위임을 본다', () => {
    expect(safetyRows({ viewerIsLeader: true, blocked: false })).toEqual(['block', 'kick', 'delegate']);
  });

  test('이미 차단한 상대면 차단 대신 해제', () => {
    expect(safetyRows({ viewerIsLeader: false, blocked: true })).toEqual(['report', 'unblock']);
    expect(safetyRows({ viewerIsLeader: true, blocked: true })).toEqual(['unblock', 'kick', 'delegate']);
  });
});

describe('5-4 활동 달력 26주×7일', () => {
  // 2026-09-29 는 화요일
  const today = '2026-09-29';

  test('26열 7행이고 마지막 열이 이번 주다', () => {
    const grid = activeDaysGrid([], today);
    expect(grid).toHaveLength(26);
    grid.forEach((week) => expect(week).toHaveLength(7));
    // 일요일 시작 주 — 이번 주 일요일은 9/27
    expect(grid[25][0]).toEqual({ date: '2026-09-27', active: false });
  });

  test('오늘 이후 칸은 그리지 않는다(null)', () => {
    const week = activeDaysGrid([], today)[25];
    expect(week[2]).toEqual({ date: '2026-09-29', active: false });
    expect(week[3]).toBeNull();
    expect(week[6]).toBeNull();
  });

  test('활동한 날은 채운 칸, 26주보다 오래된 날은 격자 밖', () => {
    // 첫 칸은 25주 전 일요일 2026-04-05
    const grid = activeDaysGrid(['2026-09-28', '2026-04-05', '2026-04-01'], today);
    expect(grid[0][0]).toEqual({ date: '2026-04-05', active: true });
    expect(grid[25][1]).toEqual({ date: '2026-09-28', active: true });
    expect(grid.flat().filter((c) => c?.active)).toHaveLength(2);
  });
});

describe('기록 카드 제목', () => {
  const now = new Date('2026-09-29T00:00:00Z');

  test('같은 해면 월일(요일) 오전/오후 시각', () => {
    // 2026-09-04 09:02Z = KST 18:02 금요일
    expect(activityTitle('2026-09-04T09:02:00Z', now)).toBe('9월 4일(금) 오후 6:02');
  });

  test('해가 다르면 연도를 붙인다', () => {
    expect(activityTitle('2025-12-03T09:02:00Z', now)).toBe('2025년 12월 3일(수) 오후 6:02');
  });
});

describe('5-6 게시 가능', () => {
  test('글과 사진이 둘 다 비면 막는다', () => {
    expect(canPost({ text: '  \n ', photoCount: 0 })).toBe(false);
  });

  test('글이나 사진 하나만 있어도 된다', () => {
    expect(canPost({ text: '오늘도', photoCount: 0 })).toBe(true);
    expect(canPost({ text: '', photoCount: 1 })).toBe(true);
  });

  test('사진은 10장까지', () => {
    expect(POST_PHOTO_MAX).toBe(10);
    expect(canPost({ text: '', photoCount: 11 })).toBe(false);
  });
});

describe('5-6 사진 순서', () => {
  test('앞으로·뒤로 옮긴다', () => {
    expect(movePhoto(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(movePhoto(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  test('끝을 넘어가면 그대로', () => {
    const list = ['a', 'b'];
    expect(movePhoto(list, 0, -1)).toBe(list);
    expect(movePhoto(list, 1, 1)).toBe(list);
  });
});

describe('5-8 바뀐 것만 보낸다', () => {
  const original = { nickname: '관열', intro: '한강 서쪽 담당' };

  test('바뀐 게 없으면 null — 저장 버튼 꺼짐', () => {
    expect(profilePatch(original, { nickname: ' 관열\n', intro: '한강 서쪽 담당' })).toBeNull();
  });

  test('닉네임을 안 건드렸으면 nickname 을 보내지 않는다', () => {
    expect(profilePatch(original, { nickname: '관열', intro: '새 소개' })).toEqual({ intro: '새 소개' });
  });

  test('닉네임은 정규화해서 보낸다', () => {
    expect(profilePatch(original, { nickname: ' 새싹 \n', intro: '한강 서쪽 담당' })).toEqual({ nickname: '새싹' });
  });

  test('사진 삭제는 null, 새 사진은 mediaId', () => {
    expect(profilePatch(original, { ...original, photoMediaId: null })).toEqual({ photoMediaId: null });
    expect(profilePatch(original, { ...original, photoMediaId: 'm1' })).toEqual({ photoMediaId: 'm1' });
  });

  test('닉네임이 유효하지 않으면 null', () => {
    expect(profilePatch(original, { nickname: '관', intro: '' })).toBeNull();
  });
});

describe('5-7 나가기·탈퇴·로그아웃 전 확인', () => {
  test('진행 중 활동이나 미동기화 기록이 있으면 막는다', () => {
    expect(accountGate({ hasCurrentActivity: true, unsyncedCount: 0 })).toBe('blocked');
    expect(accountGate({ hasCurrentActivity: false, unsyncedCount: 2 })).toBe('blocked');
  });

  test('둘 다 없으면 확인 대화상자', () => {
    expect(accountGate({ hasCurrentActivity: false, unsyncedCount: 0 })).toBe('confirm');
  });

  test('혼자 남은 크루장은 해산 확인, 아니면 일반 확인', () => {
    expect(leaveConfirm({ isLeader: true, memberCount: 1 })).toBe('dissolve');
    expect(leaveConfirm({ isLeader: true, memberCount: 3 })).toBe('leave');
    expect(leaveConfirm({ isLeader: false, memberCount: 3 })).toBe('leave');
  });

  test('403 LEADER_MUST_DELEGATE 는 위임 안내, 그 외는 재시도 스낵바', () => {
    expect(leaveFailure(new ApiError('LEADER_MUST_DELEGATE'))).toBe('delegate');
    expect(leaveFailure(new ApiError('CONFLICT'))).toBe('blocked');
    expect(leaveFailure(new Error('network'))).toBe('retry');
  });
});

describe('5-6 업로드 진행', () => {
  const photos = [
    { key: 'a', mediaId: 'm1', failed: false },
    { key: 'b', mediaId: null, failed: true },
    { key: 'c', mediaId: null, failed: false },
  ];

  test('이미 올린 사진은 다시 올리지 않는다', () => {
    expect(photosToUpload(photos).map((p) => p.key)).toEqual(['b', 'c']);
  });

  test('모두 올렸을 때만 mediaIds 를 화면 순서대로 돌려준다', () => {
    expect(readyMediaIds(photos)).toBeNull();
    expect(
      readyMediaIds([
        { key: 'x', mediaId: 'm2', failed: false },
        { key: 'y', mediaId: 'm1', failed: false },
      ]),
    ).toEqual(['m2', 'm1']);
    expect(readyMediaIds([])).toEqual([]);
  });
});

describe('게시물 초안 복원', () => {
  test('저장한 초안을 그대로 되살린다', () => {
    const d = { text: '안녕', photos: [{ key: 'a', uri: 'file://a', name: 'a.jpg', type: 'image/jpeg', mediaId: null, failed: false }], visibility: 'PRIVATE', requestId: 'r1' };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });

  test('깨졌거나 없으면 빈 초안', () => {
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT);
    expect(parseDraft('{oops')).toEqual(EMPTY_DRAFT);
  });

  test('모르는 공개 범위는 크루 전체로', () => {
    expect(parseDraft(JSON.stringify({ text: 'x', visibility: 'WORLD' })).visibility).toBe('CREW');
  });
});

describe('설정 토글 잠금', () => {
  test('보내는 중인 키는 다시 누르지 못한다', () => {
    expect(lockSetting([], 'a')).toEqual(['a']);
    expect(lockSetting(['a'], 'a')).toBeNull();
    expect(lockSetting(['a'], 'b')).toEqual(['a', 'b']);
  });
});
