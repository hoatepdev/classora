import { api } from "../../lib/api.js";
import type { Branch, BranchInput } from "./types.js";

export const branchQueryKey = () => ["branches", window.location.hostname] as const;

export async function listBranches() {
  return (await api.get<Branch[]>("/branches")).data;
}

export async function getBranch(id: string) {
  return (await api.get<Branch>(`/branches/${id}`)).data;
}

export async function createBranch(input: BranchInput) {
  return (await api.post<Branch>("/branches", input)).data;
}

export async function updateBranch(id: string, input: BranchInput) {
  return (await api.patch<Branch>(`/branches/${id}`, input)).data;
}
