import { Bell, ClipboardCheck, Gavel, MessageCircle, ShieldCheck, UserCheck, Wallet, Workflow, Wrench } from '@lucide/vue';
import type { Component } from 'vue';
import type { AgentName } from '@/types';
import type { Tone } from './status';

export interface AgentMeta {
  label: string;
  responsibility: string;
  tone: Tone;
  icon: Component;
}

export const AGENTS: Record<AgentName, AgentMeta> = {
  ORCHESTRATOR: {
    label: 'Orchestrator',
    responsibility: 'Owns the process: decides which agent acts next, pauses for humans, resumes.',
    tone: 'slate',
    icon: Workflow,
  },
  RENTAL: {
    label: 'Rental Agent',
    responsibility: 'Validates the request, availability and period. Finalises the rental.',
    tone: 'blue',
    icon: ClipboardCheck,
  },
  MAINTENANCE: {
    label: 'Maintenance Agent',
    responsibility: 'Checks service dates, inspections and reported issues. Can block equipment.',
    tone: 'amber',
    icon: Wrench,
  },
  RISK: {
    label: 'Risk & Compliance Agent',
    responsibility: 'Assesses customers and detects anomalies (late patterns, inconsistent data). Never accuses — flags for review.',
    tone: 'violet',
    icon: ShieldCheck,
  },
  FINANCE: {
    label: 'Finance Agent',
    responsibility: 'Checks outstanding payments before approval, registers payments, flags overdue and pending amounts.',
    tone: 'green',
    icon: Wallet,
  },
  APPROVAL: {
    label: 'Approval Agent',
    responsibility: 'Takes the final decision on every request and triages anomalies — no human in the loop. Rejects when unsure.',
    tone: 'red',
    icon: Gavel,
  },
  NOTIFICATION: {
    label: 'Notification Agent',
    responsibility: 'Turns events into notifications: confirmations, return reminders, overdue notices, prioritised alerts.',
    tone: 'teal',
    icon: Bell,
  },
  ASSISTANT: {
    label: 'Customer Assistant',
    responsibility: 'Chats with customers on the QR pages: availability, prices, documents, payment, request status. Read-only.',
    tone: 'blue',
    icon: MessageCircle,
  },
  ONBOARDING: {
    label: 'Onboarding Agent',
    responsibility: 'Validates every customer self-registration and activates or rejects the account. Rejects when unsure.',
    tone: 'teal',
    icon: UserCheck,
  },
};

/** The default path of a request through the agents (for the pipeline diagram). */
export const PIPELINE: AgentName[] = ['ORCHESTRATOR', 'RENTAL', 'MAINTENANCE', 'RISK', 'FINANCE', 'APPROVAL', 'NOTIFICATION'];

/** The monitoring cycle: agents acting without a request. */
export const MONITORING_PIPELINE: AgentName[] = ['ORCHESTRATOR', 'MAINTENANCE', 'FINANCE', 'RISK', 'APPROVAL', 'NOTIFICATION'];
