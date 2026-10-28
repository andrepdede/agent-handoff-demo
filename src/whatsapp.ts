/** Parses the (simplified) Evolution API "messages.upsert" webhook payload. */
export interface Inbound { phone: string; text: string }

export function parseEvolutionPayload(body: any): Inbound | null {
  if (body?.event !== 'messages.upsert') return null;
  const key = body?.data?.key;
  if (!key || key.fromMe) return null;
  const text = body?.data?.message?.conversation ?? body?.data?.message?.extendedTextMessage?.text;
  const jid: string | undefined = key.remoteJid;
  if (!text || !jid) return null;
  return { phone: jid.split('@')[0], text };
}

export interface Sender { send(phone: string, text: string): Promise<void> }

/** Replace with a real call to the Evolution API send-text endpoint in production. */
export class ConsoleSender implements Sender {
  outbox: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.outbox.push({ phone, text });
    console.log(`[to ${phone}] ${text}`);
  }
}
