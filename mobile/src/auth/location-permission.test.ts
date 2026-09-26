import { PermissionsAndroid } from 'react-native';
import { createLocationGate, requestPreciseLocation } from './location-permission';

test('정확한 위치와 대략적 위치를 함께 요청하고 정확한 위치 결과로 판단한다', async () => {
  const { ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION } = PermissionsAndroid.PERMISSIONS;
  const request = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [ACCESS_FINE_LOCATION]: PermissionsAndroid.RESULTS.DENIED,
    [ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  try {
    await expect(requestPreciseLocation()).resolves.toBe(PermissionsAndroid.RESULTS.DENIED);
    expect(request).toHaveBeenCalledWith([ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION]);
  } finally {
    request.mockRestore();
  }
});

describe('createLocationGate', () => {
  function setup(granted: boolean[]) {
    const hasPreciseLocation = jest.fn(async () => granted.shift() ?? false);
    const openGuide = jest.fn();
    const onReady = jest.fn();
    return { gate: createLocationGate({ hasPreciseLocation, openGuide }), openGuide, onReady };
  }

  test('정확한 위치가 있으면 안내 없이 바로 시작한다', async () => {
    const { gate, openGuide, onReady } = setup([true]);
    await gate.require(onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(openGuide).not.toHaveBeenCalled();
  });

  test('없으면 1-10 을 열고, 허용하고 돌아오면 멈췄던 시작을 한 번만 이어 간다', async () => {
    const { gate, openGuide, onReady } = setup([false, true]);
    await gate.require(onReady);
    expect(openGuide).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    await gate.resume();
    await gate.resume();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('나중에·뒤로로 돌아오면 시작하지 않고 대기도 비운다', async () => {
    const { gate, onReady } = setup([false, false, true]);
    await gate.require(onReady);
    await gate.resume();
    await gate.resume();
    expect(onReady).not.toHaveBeenCalled();
  });

  test('시작을 누르지 않은 채 포커스가 돌아와도 아무것도 하지 않는다', async () => {
    const { gate, onReady } = setup([true]);
    await gate.resume();
    expect(onReady).not.toHaveBeenCalled();
  });
});
