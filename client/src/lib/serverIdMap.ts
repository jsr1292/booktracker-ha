/**
 * Shared server ID map — tracks local ID ↔ server ID mappings.
 * Used by both db.ts and sync.ts.
 */

const SERVER_ID_MAP_KEY = 'booktracker_server_id_map';

export function getServerIdMap(): Record<number, number> {
  try {
    const raw = localStorage.getItem(SERVER_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setServerIdMap(map: Record<number, number>): void {
  localStorage.setItem(SERVER_ID_MAP_KEY, JSON.stringify(map));
}

export function getServerId(localId: number): number | undefined {
  return getServerIdMap()[localId];
}

export function setServerId(localId: number, serverId: number): void {
  const map = getServerIdMap();
  map[localId] = serverId;
  setServerIdMap(map);
}

export function removeServerId(localId: number): void {
  const map = getServerIdMap();
  delete map[localId];
  setServerIdMap(map);
}
