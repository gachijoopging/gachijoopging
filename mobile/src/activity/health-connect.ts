import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { StepSource } from './steps';

const READ_STEPS = { accessType: 'read', recordType: 'Steps' } as const;
const hasSteps = (granted: readonly { accessType: string; recordType?: string }[]) =>
  granted.some((p) => p.accessType === 'read' && p.recordType === 'Steps');

/** 삼성헬스 등 Health Connect 에 걸음을 쓰는 앱의 기록을 합쳐 읽는다 */
export const healthConnect: StepSource & { connect(): Promise<boolean>; openSettings(): void } = {
  async status() {
    const sdk = await getSdkStatus().catch(() => SdkAvailabilityStatus.SDK_UNAVAILABLE);
    if (sdk === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
    if (sdk === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'not-installed';
    if (!(await initialize())) return 'unavailable';
    return hasSteps(await getGrantedPermissions()) ? 'granted' : 'denied';
  },
  async count(from, to) {
    const result = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: from, endTime: to } });
    return result.COUNT_TOTAL;
  },
  async connect() {
    if (!(await initialize())) return false;
    return hasSteps(await requestPermission([READ_STEPS]));
  },
  openSettings: openHealthConnectSettings,
};
