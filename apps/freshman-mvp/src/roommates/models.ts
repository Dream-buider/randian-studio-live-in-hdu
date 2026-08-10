export type CampusCode = 'xiasha' | 'shaoxing';
export type RoomOrientation = 'south' | 'north';
export type ContactType = 'wechat' | 'qq' | 'phone' | 'other';
export type RoommateStatus = 'active' | 'hidden' | 'deleted' | 'expired';

export interface RoomAddressInput {
  campus: CampusCode;
  building: string;
  orientation: RoomOrientation;
  room: string;
}

export interface NormalizedRoomAddress extends RoomAddressInput {
  templateVersion: 'xiasha-v1';
  canonical: string;
  display: string;
}
