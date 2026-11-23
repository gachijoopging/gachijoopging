import { File, Paths } from 'expo-file-system';

export type Photo = { key: string; uri: string; sourceUri: string; name: string; type: string; mediaId: string | null; failed: boolean };
export type Draft = { text: string; photos: Photo[]; visibility: 'CREW' | 'PRIVATE'; requestId: string | null };
export const emptyDraft = (): Draft => ({ text: '', photos: [], visibility: 'CREW', requestId: null });
export type PostScope = { userId: string; crewId: string };

const fileOf = (scope: PostScope, suffix = '') => new File(Paths.document, `post-draft-${encodeURIComponent(scope.userId)}-${encodeURIComponent(scope.crewId)}.json${suffix}`);
const scopeFile = (userId: string) => new File(Paths.document, `post-crew-${encodeURIComponent(userId)}.json`);

export function rememberPostScope(scope: PostScope): void { scopeFile(scope.userId).write(JSON.stringify(scope)); }
export function lastPostScope(userId: string): PostScope | null {
  try {
    const file = scopeFile(userId);
    const value = file.exists ? JSON.parse(file.textSync()) : null;
    return value?.userId === userId && typeof value.crewId === 'string' ? value : null;
  } catch { return null; }
}

const parse = (file: File): Draft | null => {
  try {
    if (!file.exists) return null;
    const value = JSON.parse(file.textSync());
    return typeof value.text === 'string' && Array.isArray(value.photos) && ['CREW', 'PRIVATE'].includes(value.visibility) ? value : null;
  } catch { return null; }
};

export function loadDraft(scope: PostScope): Draft { return parse(fileOf(scope, '.tmp')) ?? parse(fileOf(scope)) ?? emptyDraft(); }

export function saveDraft(scope: PostScope, next: Draft): void {
  const tmp = fileOf(scope, '.tmp');
  if (tmp.exists) fileOf(scope).write(JSON.stringify(loadDraft(scope)));
  tmp.write(JSON.stringify(next));
  try { fileOf(scope).write(JSON.stringify(next)); tmp.delete(); } catch {}
}

export function changedDraft(previous: Draft, next: Draft): Draft {
  const body = (draft: Draft) => JSON.stringify([draft.text.trim(), draft.visibility, draft.photos.map((photo) => photo.key)]);
  return body(previous) === body(next) ? next : { ...next, requestId: null };
}

export function keepPhoto(source: { uri: string; name: string; type: string }, key: string): Photo {
  const extension = source.name.match(/\.(png|jpe?g|webp|heic)$/i)?.[0] ?? '.jpg';
  const destination = new File(Paths.document, `post-photo-${key}${extension}`);
  new File(source.uri).copy(destination);
  return { ...source, key, sourceUri: source.uri, uri: destination.uri, mediaId: null, failed: false };
}

export function discardPhotos(photos: readonly Photo[]): void {
  for (const photo of photos) {
    try { const file = new File(photo.uri); if (file.exists) file.delete(); } catch {}
  }
}
