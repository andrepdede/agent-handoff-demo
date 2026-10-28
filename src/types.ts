export type Role = 'sales' | 'legal' | 'finance' | 'support';
export type State = 'sales' | 'collecting' | 'contract_sent' | 'support' | 'human';

export interface Contact { phone: string; isCustomer: boolean }
export interface LeadData { name?: string; company?: string; email?: string; plan?: string }
export interface Message { from: 'contact' | Role; text: string; at: string }
export interface TraceEvent { at: string; type: 'handoff' | 'escalation' | 'tool'; detail: string }

export interface Conversation {
  id: string;
  contact: Contact;
  state: State;
  lead: LeadData;
  messages: Message[];
  trace: TraceEvent[];
}

export interface Reply { from: Role; text: string }
