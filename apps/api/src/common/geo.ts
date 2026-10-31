import { Queryable } from '../database/database';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Biểu thức PostGIS tạo điểm geography từ hai tham số ($lng, $lat). */
export const point = (lngParam: number, latParam: number) =>
  `ST_SetSRID(ST_MakePoint($${lngParam}::float8, $${latParam}::float8), 4326)::geography`;

export async function distanceToStoreM(db: Queryable, storeId: number, at: LatLng): Promise<number> {
  const { rows } = await db.query<{ d: number }>(
    `SELECT ST_Distance(location, ${point(2, 3)}) AS d FROM stores WHERE id = $1`,
    [storeId, at.lng, at.lat],
  );
  return Number(rows[0]?.d ?? Infinity);
}
