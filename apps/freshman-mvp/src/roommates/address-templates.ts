import type {
  NormalizedRoomAddress,
  RoomAddressInput,
  RoomOrientation,
} from './models.js';

export interface EnabledCampusTemplateSummary {
  code: 'xiasha';
  name: string;
  templateVersion: 'xiasha-v1';
  enabled: true;
}

export interface DisabledCampusTemplateSummary {
  code: 'shaoxing';
  name: string;
  templateVersion: null;
  enabled: false;
  unavailableReason: string;
}

export type CampusTemplateSummary = EnabledCampusTemplateSummary | DisabledCampusTemplateSummary;

const SHAOXING_UNAVAILABLE_REASON = '寝室分配规则确认中，暂未开放匹配';

const CAMPUS_TEMPLATES: readonly CampusTemplateSummary[] = [
  { code: 'xiasha', name: '下沙校区', templateVersion: 'xiasha-v1', enabled: true },
  {
    code: 'shaoxing',
    name: '绍兴校区',
    templateVersion: null,
    enabled: false,
    unavailableReason: SHAOXING_UNAVAILABLE_REASON,
  },
];

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function normalizeNumeric(value: string, field: string): string {
  const trimmed = value.trim();
  if (containsControlCharacter(value) || !/^\d+$/.test(trimmed)) {
    throw new Error(`${field}格式无效`);
  }
  const normalized = trimmed.replace(/^0+(?=\d)/, '');
  if (Number(normalized) <= 0) {
    throw new Error(`${field}必须为正数`);
  }
  return normalized;
}

function normalizeRoom(value: string): string {
  const trimmed = value.trim();
  if (containsControlCharacter(value) || !/^[A-Z0-9]{1,10}$/.test(trimmed)) {
    throw new Error('房间号格式无效');
  }
  return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, '') : trimmed;
}

export function listCampusTemplates(): CampusTemplateSummary[] {
  return CAMPUS_TEMPLATES.map((template) => ({ ...template }));
}

export function normalizeRoomAddress(input: RoomAddressInput): NormalizedRoomAddress {
  if (input.campus === 'shaoxing') {
    throw new Error(SHAOXING_UNAVAILABLE_REASON);
  }
  if (input.campus !== 'xiasha') {
    throw new Error('校区不支持');
  }
  if (input.orientation !== 'south' && input.orientation !== 'north') {
    throw new Error('朝向不支持');
  }

  const building = normalizeNumeric(input.building, '楼栋');
  const room = normalizeRoom(input.room);
  const orientation = input.orientation as RoomOrientation;
  const orientationDisplay = orientation === 'south' ? '南' : '北';

  return {
    campus: 'xiasha',
    templateVersion: 'xiasha-v1',
    building,
    orientation,
    room,
    canonical: `xiasha|xiasha-v1|${building}|${orientation}|${room}`,
    display: `下沙校区 · ${building}号楼 · ${orientationDisplay} · ${room}`,
  };
}
