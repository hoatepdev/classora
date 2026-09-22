import { api } from "../../lib/api.js";
import type { Room, RoomInput } from "./types.js";

export const roomQueryKey = () => ["rooms", window.location.hostname] as const;

export async function listRooms(branchId?: string) {
  return (await api.get<Room[]>("/rooms", { params: branchId ? { branchId } : undefined })).data;
}

export async function getRoom(id: string) {
  return (await api.get<Room>(`/rooms/${id}`)).data;
}

export async function createRoom(input: RoomInput) {
  return (await api.post<Room>("/rooms", input)).data;
}

export async function updateRoom(id: string, input: RoomInput) {
  return (await api.patch<Room>(`/rooms/${id}`, input)).data;
}
