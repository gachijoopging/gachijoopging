import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * 스낵바 상태. 앞 화면이 저장·삭제 뒤 사라지면서 결과 문구를 `flash` 파라미터로 넘기면
 * 돌아온 이 화면이 띄운다. 한 번 띄우면 파라미터를 지워 뒤로·재진입 때 다시 뜨지 않는다.
 */
export function useFlash() {
  const { flash } = useLocalSearchParams<{ flash?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    setMessage(flash);
    router.setParams({ flash: undefined });
  }, [flash]);

  return [message, setMessage] as const;
}
