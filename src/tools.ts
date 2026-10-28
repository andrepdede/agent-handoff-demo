import type { LeadData } from './types.js';

/** CRM port: in production this is a database; here a tiny in-memory implementation. */
export interface Crm { isCustomer(phone: string): boolean; markCustomer(phone: string): void }
export class InMemoryCrm implements Crm {
  constructor(private customers = new Set<string>()) {}
  isCustomer(phone: string) { return this.customers.has(phone); }
  markCustomer(phone: string) { this.customers.add(phone); }
}

/** Payment port: the finance agent only ever calls this. */
export interface PaymentProvider { createLink(lead: LeadData): Promise<string> }
export class FakePayments implements PaymentProvider {
  private n = 0;
  async createLink(lead: LeadData) {
    this.n += 1;
    return `https://pay.example.test/checkout/${this.n}?plan=${encodeURIComponent(lead.plan ?? '')}`;
  }
}

export function buildContract(lead: LeadData): string {
  return [
    'SERVICE AGREEMENT (demo template)',
    `Customer: ${lead.name} (${lead.company})`,
    `Contact e-mail: ${lead.email}`,
    `Plan: ${lead.plan}`,
    'Terms: monthly subscription, cancel anytime with 30 days notice.',
  ].join('\n');
}
