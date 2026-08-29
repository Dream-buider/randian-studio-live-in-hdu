import type { SqliteDatabase } from '../db/sqlite.js';
import type { CampusCode } from '../roommates/models.js';
import type {
  BuildingGroupRecord,
  RoommateBuildingGroupRepository,
} from '../roommates/building-groups.js';

type Row = Record<string, unknown>;

export class SqliteRoommateBuildingGroupRepository implements RoommateBuildingGroupRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async get(campus: CampusCode, building: string): Promise<BuildingGroupRecord | null> {
    const row = this.database.prepare(`
      SELECT campus_code, building, image_mime, image_blob, image_sha256,
             image_size, updated_at, updated_by
      FROM roommate_building_groups
      WHERE campus_code = ? AND building = ?
    `).get(campus, building) as Row | undefined;
    return row ? this.toRecord(row) : null;
  }

  async list(): Promise<BuildingGroupRecord[]> {
    const rows = this.database.prepare(`
      SELECT campus_code, building, image_mime, image_blob, image_sha256,
             image_size, updated_at, updated_by
      FROM roommate_building_groups
      ORDER BY campus_code ASC, CAST(building AS INTEGER) ASC
    `).all() as Row[];
    return rows.map((row) => this.toRecord(row));
  }

  async upsert(record: BuildingGroupRecord): Promise<BuildingGroupRecord> {
    this.database.prepare(`
      INSERT INTO roommate_building_groups (
        campus_code, building, image_mime, image_blob, image_sha256,
        image_size, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campus_code, building) DO UPDATE SET
        image_mime = excluded.image_mime,
        image_blob = excluded.image_blob,
        image_sha256 = excluded.image_sha256,
        image_size = excluded.image_size,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(
      record.campusCode,
      record.building,
      record.imageMime,
      record.imageBlob,
      record.imageSha256,
      record.imageSize,
      record.updatedAt,
      record.updatedBy,
    );
    return record;
  }

  async delete(campus: CampusCode, building: string): Promise<boolean> {
    const result = this.database.prepare(
      'DELETE FROM roommate_building_groups WHERE campus_code = ? AND building = ?',
    ).run(campus, building) as { changes?: number };
    return Number(result.changes ?? 0) === 1;
  }

  private toRecord(row: Row): BuildingGroupRecord {
    const blob = row.image_blob;
    return {
      campusCode: String(row.campus_code) as CampusCode,
      building: String(row.building),
      imageMime: String(row.image_mime) as BuildingGroupRecord['imageMime'],
      imageBlob: Buffer.from(blob as Uint8Array),
      imageSha256: String(row.image_sha256),
      imageSize: Number(row.image_size),
      updatedAt: String(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }
}

