/** docs/openapi.yaml 의 Region. 화면 표기는 앱이 정한다 — 순서도 계약 그대로 시트에 쓴다 */
export const REGIONS = [
  ['SEOUL', '서울특별시'],
  ['BUSAN', '부산광역시'],
  ['DAEGU', '대구광역시'],
  ['INCHEON', '인천광역시'],
  ['GWANGJU', '광주광역시'],
  ['DAEJEON', '대전광역시'],
  ['ULSAN', '울산광역시'],
  ['SEJONG', '세종특별자치시'],
  ['GYEONGGI', '경기도'],
  ['GANGWON', '강원특별자치도'],
  ['CHUNGBUK', '충청북도'],
  ['CHUNGNAM', '충청남도'],
  ['JEONBUK', '전북특별자치도'],
  ['JEONNAM', '전라남도'],
  ['GYEONGBUK', '경상북도'],
  ['GYEONGNAM', '경상남도'],
  ['JEJU', '제주특별자치도'],
] as const;

export type Region = (typeof REGIONS)[number][0];
export type JoinPolicy = 'OPEN' | 'APPROVAL';

/** 크루장 포함. 승인 대기 신청자는 세지 않는다 */
export const CREW_CAPACITY = 50;

const NAMES = new Map<string, string>(REGIONS);

export function regionName(code: string): string {
  return NAMES.get(code) ?? code;
}

export const JOIN_POLICY_LABEL: Record<JoinPolicy, string> = { OPEN: '공개', APPROVAL: '비공개' };
