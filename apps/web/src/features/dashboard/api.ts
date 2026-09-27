import { api } from "@/lib/api";
import type { DashboardResponse } from "./types";

export const dashboardQueryKey = () => ["dashboard", window.location.hostname] as const;

export async function getDashboard() {
  return (await api.get<DashboardResponse>("/dashboard")).data;
}
