import { ulid } from 'ulid';

export type AdapterSendInput = {
  channel: 'IN_APP' | 'EMAIL';
  destination: string | null;
  subject: string | null;
  body: string;
};

export type DeliveryResult = {
  provider: 'LOCAL';
  providerMessageId: string;
};

export interface CommunicationChannelAdapter {
  send(message: AdapterSendInput): Promise<DeliveryResult>;
}

// IN_APP delivery is the persisted message row itself; there is no external
// side effect and no network call. LOCAL-12 portals will read these rows.
export class InAppAdapter implements CommunicationChannelAdapter {
  async send(): Promise<DeliveryResult> {
    return { provider: 'LOCAL', providerMessageId: `in-app-${ulid().toLowerCase()}` };
  }
}

// Development EMAIL adapter: deterministic, performs no network request, and
// never logs destinations or bodies. "SENT" from this provider means accepted
// by the LOCAL adapter, not delivered to a real mailbox. The failure predicate
// is a test seam only; production wiring passes none.
export class LocalEmailAdapter implements CommunicationChannelAdapter {
  constructor(private readonly shouldFail?: (message: AdapterSendInput) => boolean) {}

  async send(message: AdapterSendInput): Promise<DeliveryResult> {
    if (this.shouldFail?.(message)) throw new Error('Local email adapter simulated delivery failure');
    return { provider: 'LOCAL', providerMessageId: `local-${ulid().toLowerCase()}` };
  }
}
