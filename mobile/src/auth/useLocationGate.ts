import { useCallback, useRef } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { createLocationGate, getPermissionMode } from './location-permission';

/** 4-1 "줍깅 시작" 이 부른다. 1-10 모달이 닫혀 이 화면으로 포커스가 돌아오면 멈췄던 시작을 이어 간다. */
export function useLocationGate() {
  const gate = useRef(
    createLocationGate({
      hasPreciseLocation: async () => (await getPermissionMode()) === 'granted',
      openGuide: () => router.push('/1-10-location-permission'),
    }),
  ).current;
  useFocusEffect(useCallback(() => { void gate.resume(); }, [gate]));
  return gate.require;
}
