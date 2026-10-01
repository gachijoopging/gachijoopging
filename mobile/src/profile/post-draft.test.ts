import { changedDraft, emptyDraft, keepPhoto, lastPostScope, loadDraft, rememberPostScope, saveDraft, type Draft } from './post-draft';

const mockFiles = new Map<string, string>();
let mockFailWrite: string | null = null;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    uri: string;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    textSync() { return mockFiles.get(this.uri); }
    write(text: string) {
      if (mockFailWrite && this.uri.endsWith(mockFailWrite)) { mockFiles.set(this.uri, '{'); throw new Error('disk full'); }
      mockFiles.set(this.uri, text);
    }
    delete() { mockFiles.delete(this.uri); }
    copy(target: { uri: string }) {
      if (!mockFiles.has(this.uri)) throw new Error('missing photo');
      mockFiles.set(target.uri, mockFiles.get(this.uri)!);
    }
  },
}));
const scope = { userId: 'u1', crewId: 'c1' };
beforeEach(() => { mockFiles.clear(); mockFailWrite = null; });

test('초안과 업로드·게시 요청 id는 다시 읽어도 유지되고 계정·크루별로 분리된다', () => {
  mockFiles.set('picker/photo.jpg', 'image');
  const photo = { ...keepPhoto({ uri: 'picker/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }, 'upload-id'), mediaId: 'saved-media' };
  const draft: Draft = { text: '비공개 초안', photos: [photo], visibility: 'PRIVATE', requestId: 'post-id' };
  saveDraft(scope, draft);
  expect(loadDraft(scope)).toEqual(draft);
  expect(loadDraft({ userId: 'u2', crewId: 'c1' })).toEqual(emptyDraft());
  expect(loadDraft({ userId: 'u1', crewId: 'c2' })).toEqual(emptyDraft());
});

test('사진은 원본 선택기 파일이 사라져도 앱 문서 폴더에서 다시 읽을 수 있다', () => {
  mockFiles.set('picker/temp.png', 'image');
  const photo = keepPhoto({ uri: 'picker/temp.png', name: 'summary.png', type: 'image/png' }, 'upload-id');
  mockFiles.delete('picker/temp.png');
  expect(photo.key).toBe('upload-id');
  expect(photo.uri).toBe('documents/post-photo-upload-id.png');
  expect(mockFiles.get(photo.uri)).toBe('image');
});

test('게시 실패 후 글·공개 범위·사진 순서가 바뀌면 새 게시 요청으로 취급한다', () => {
  const base = { ...emptyDraft(), text: '처음', requestId: 'post-id' };
  expect(changedDraft(base, { ...base, text: '수정' }).requestId).toBeNull();
  expect(changedDraft(base, { ...base, visibility: 'PRIVATE' }).requestId).toBeNull();
  const a = { key: 'a' } as Draft['photos'][number];
  const b = { key: 'b' } as Draft['photos'][number];
  const pictures = { ...base, photos: [a, b] };
  expect(changedDraft(pictures, { ...pictures, photos: [b, a] }).requestId).toBeNull();
  expect(changedDraft(pictures, { ...pictures, photos: [{ ...a, mediaId: 'uploaded' }, b] }).requestId).toBe('post-id');
});

test('비원자적 임시 파일 쓰기 실패 시 이전 초안과 요청 id를 복구한다', () => {
  const before = { ...emptyDraft(), text: '남아야 하는 글', requestId: 'old-id' };
  saveDraft(scope, before);
  mockFailWrite = '.tmp';
  expect(() => saveDraft(scope, { ...before, text: '변경' })).toThrow('disk full');
  expect(loadDraft(scope)).toEqual(before);
});

test('본 파일 쓰기 실패 시 최신 초안을 임시 파일에서 복구한다', () => {
  mockFailWrite = '.json';
  const latest = { ...emptyDraft(), text: '최신 글' };
  saveDraft(scope, latest);
  expect(loadDraft(scope)).toEqual(latest);
});

test('오프라인용 마지막 크루 정보는 계정에 종속된다', () => {
  rememberPostScope(scope);
  expect(lastPostScope('u1')).toEqual(scope);
  expect(lastPostScope('u2')).toBeNull();
});
