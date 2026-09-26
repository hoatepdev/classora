import { api } from "@/lib/api";
import type {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationListFilters,
  CommunicationMessage,
  CommunicationTemplatePreview,
  CommunicationTemplateView,
} from "./types.js";

export type CommunicationListResponse = { data: CommunicationMessage[]; nextCursor: string | null };

export const communicationQueryKey = (filters?: CommunicationListFilters) => ["communications", window.location.hostname, filters ?? {}] as const;
export const communicationMessageQueryKey = (id: string) => ["communication", window.location.hostname, id] as const;
export const communicationTemplatesQueryKey = () => ["communication-templates", window.location.hostname] as const;

export async function listCommunications(filters: CommunicationListFilters = {}) {
  return (await api.get<CommunicationListResponse>("/communications", { params: filters })).data;
}

export async function getCommunicationMessage(id: string) {
  return (await api.get<CommunicationMessage>(`/communications/${id}`)).data;
}

export async function retryCommunicationMessage(id: string) {
  return (await api.post<CommunicationMessage>(`/communications/${id}/retry`)).data;
}

export async function listCommunicationTemplates() {
  return (await api.get<CommunicationTemplateView[]>("/communications/templates")).data;
}

export async function upsertCommunicationTemplate(
  eventType: CommunicationEventType,
  channel: CommunicationChannel,
  input: { subject?: string; body: string; enabled?: boolean },
) {
  return (await api.put<CommunicationTemplateView>(`/communications/templates/${eventType}/${channel}`, input)).data;
}

export async function resetCommunicationTemplate(eventType: CommunicationEventType, channel: CommunicationChannel) {
  return (await api.post<CommunicationTemplateView>(`/communications/templates/${eventType}/${channel}/reset`)).data;
}

export async function setCommunicationTemplateEnabled(eventType: CommunicationEventType, channel: CommunicationChannel, enabled: boolean) {
  return (await api.post<CommunicationTemplateView>(`/communications/templates/${eventType}/${channel}/${enabled ? "enable" : "disable"}`)).data;
}

export async function previewCommunicationTemplate(
  eventType: CommunicationEventType,
  channel: CommunicationChannel,
  draft?: { subject?: string; body: string },
) {
  return (await api.post<CommunicationTemplatePreview>(`/communications/templates/${eventType}/${channel}/preview`, draft ?? {})).data;
}
