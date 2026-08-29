import type {
  BedNumber,
  CampusCode,
  NormalizedRoomAddress,
  RoomAddressInput,
  RoomOrientation,
} from './models.js';

export interface EnabledCampusTemplateSummary {
  code: CampusCode;
  name: string;
  templateVersion: 'xiasha-v1' | 'shaoxing-v1';
  enabled: true;
}

export type CampusTemplateSummary = EnabledCampusTemplateSummary;

const CAMPUS_TEMPLATES: readonly CampusTemplateSummary[] = [
  { code: 'xiasha', name: '下沙校区', templateVersion: 'xiasha-v1', enabled: true },
  { code: 'shaoxing', name: '绍兴校区', templateVersion: 'shaoxing-v1', enabled: true },
];

const ORIENTATION_LABELS: Record<RoomOrientation, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
  unknown: '不确定',
};

const BED_NUMBERS: readonly BedNumber[] = ['1', '2', '3', '4', '5'];

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
  if (Number(normalized) > 40) {
    throw new Error(`${field}必须在1-40号之间`);
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

function normalizeBed(value: unknown): BedNumber | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !BED_NUMBERS.includes(value as BedNumber)) {
    throw new Error('床位必须为1-5号');
  }
  return value as BedNumber;
}

export function listCampusTemplates(): CampusTemplateSummary[] {
  return CAMPUS_TEMPLATES.map((template) => ({ ...template }));
}

export function normalizeRoomAddress(input: RoomAddressInput): NormalizedRoomAddress {
  const campusTemplate = CAMPUS_TEMPLATES.find((template) => template.code === input.campus);
  if (!campusTemplate) {
    throw new Error('校区不支持');
  }
  if (!Object.prototype.hasOwnProperty.call(ORIENTATION_LABELS, input.orientation)) {
    throw new Error('朝向不支持');
  }

  const building = normalizeNumeric(input.building, '楼栋');
  const room = normalizeRoom(input.room);
  const orientation = input.orientation as RoomOrientation;
  const bed = normalizeBed(input.bed);
  const displayParts = [
    campusTemplate.name,
    `${building}号楼`,
    ORIENTATION_LABELS[orientation],
    room,
  ];
  if (bed !== null) displayParts.push(`${bed}号床`);

  return {
    campus: campusTemplate.code,
    templateVersion: campusTemplate.templateVersion,
    building,
    orientation,
    room,
    bed,
    canonical: `${campusTemplate.code}|${campusTemplate.templateVersion}|${building}|${orientation}|${room}`,
    display: displayParts.join(' · '),
  };
}
