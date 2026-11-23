import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient } from '../api/client';

export type AgreementType = 'TERMS' | 'PRIVACY' | 'MARKETING';
export type AgreementDefinition = { type: AgreementType; version: string; required: boolean; url: string };
export type AgreementItem = AgreementDefinition & { agreed: boolean; agreedAt: string | null };
export type AgreementState = { complete: boolean; items: readonly AgreementItem[] };
type Choice = { type: AgreementType; version: string; agreed: boolean };
const fileOf = (scope: string) => new File(Paths.document, `agreement-draft-${encodeURIComponent(scope)}.json`);
const drafts = new Map<string, readonly Choice[]>();

function draftFor(scope: string): readonly Choice[] {
  if (!drafts.has(scope)) {
    let choices: Choice[] = [];
    try {
      const file = fileOf(scope);
      const value = file.exists ? JSON.parse(file.textSync()) : [];
      if (Array.isArray(value)) choices = value.filter((item) => ['TERMS', 'PRIVACY', 'MARKETING'].includes(item?.type) && typeof item.version === 'string' && typeof item.agreed === 'boolean');
    } catch {}
    drafts.set(scope, choices);
  }
  return drafts.get(scope)!;
}

export function restoreAgreementChoices(scope: string, items: readonly AgreementItem[]): AgreementItem[] {
  const choices = draftFor(scope);
  return items.map((item) => {
    const choice = choices.find((saved) => saved.type === item.type && saved.version === item.version);
    return choice ? { ...item, agreed: choice.agreed } : item;
  });
}

export function rememberAgreementChoices(scope: string, items: readonly AgreementItem[]): void {
  const choices = items.map(({ type, version, agreed }) => ({ type, version, agreed }));
  drafts.set(scope, choices);
  try { fileOf(scope).write(JSON.stringify(choices)); } catch {}
}

export function clearAgreementChoices(scope: string): void {
  drafts.delete(scope);
  try { const file = fileOf(scope); if (file.exists) file.delete(); } catch {}
}

export const requiredAgreementsAccepted = (items: readonly AgreementItem[]) => items.some((item) => item.required) && items.every((item) => !item.required || item.agreed);

export function useAgreementForm(api: ApiClient, scope: string | null, anonymous = false) {
  const [items, setItems] = useState<readonly AgreementItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const itemsRef = useRef<readonly AgreementItem[] | null>(null);
  const request = useRef(0);
  const reload = useCallback(async () => {
    if (!scope) return;
    const generation = ++request.current;
    try {
      const data = anonymous ? (await api.get('GET /agreements')).data : (await api.get('GET /users/me/agreements')).data;
      if (generation !== request.current) return;
      const definitions: AgreementItem[] = data.items.map((item) => ({ ...item, agreed: 'agreed' in item && item.agreed === true, agreedAt: 'agreedAt' in item && typeof item.agreedAt === 'string' ? item.agreedAt : null }));
      const restored = restoreAgreementChoices(scope, definitions);
      itemsRef.current = restored;
      setItems(restored);
      setFailed(false);
    } catch {
      if (generation === request.current) setFailed(true);
    }
  }, [api, scope, anonymous]);
  useEffect(() => {
    setItems(null);
    itemsRef.current = null;
    setFailed(false);
    void reload();
    return () => { request.current += 1; };
  }, [reload]);
  const change = (type: AgreementType, agreed: boolean) => {
    if (!scope || !itemsRef.current) return;
    const next = itemsRef.current.map((item) => item.type === type ? { ...item, agreed } : item);
    itemsRef.current = next;
    rememberAgreementChoices(scope, next);
    setItems(next);
  };
  return { items, failed, reload, change };
}
