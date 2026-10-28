import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { GymMember } from '../members/member.entity';

export const GATE_PROTOCOLS = ['yt-http-digest', 'zk-tcp-4370', 'vendor-sdk'] as const;
export type GateProtocol = (typeof GATE_PROTOCOLS)[number];

export interface GateCapabilities {
  events: boolean;
  userSync: boolean;
  doorOpen: boolean;
}

export type AdapterStatus = 'ready' | 'hardware_pending' | 'not_validated';

/** Server-side capability table (contract §5); clients never write these fields. */
export const PROTOCOL_TABLE: Record<
  GateProtocol,
  { capabilities: GateCapabilities; adapterStatus: AdapterStatus; defaultPort: number | null }
> = {
  'yt-http-digest': {
    capabilities: { events: true, userSync: true, doorOpen: false },
    adapterStatus: 'hardware_pending',
    defaultPort: 80,
  },
  'zk-tcp-4370': {
    capabilities: { events: false, userSync: false, doorOpen: false },
    adapterStatus: 'not_validated',
    defaultPort: 4370,
  },
  'vendor-sdk': {
    capabilities: { events: false, userSync: false, doorOpen: false },
    adapterStatus: 'not_validated',
    defaultPort: null,
  },
};

/** Agents send a heartbeat every 60 s (older agents every 15 s); allow two missed beats. */
export const ONLINE_WINDOW_MS = 150_000;
export const LEASE_MS = 60_000;
export const PAIRING_CODE_TTL_MS = 10 * 60_000;
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;
export const SYNC_KIND = 'userSync';
export const TR_TIME_ZONE = 'Europe/Istanbul';

export function resolveProtocol(value: unknown): GateProtocol {
  return GATE_PROTOCOLS.includes(value as GateProtocol) ? (value as GateProtocol) : 'yt-http-digest';
}

export function gateCapabilities(protocol: unknown): GateCapabilities {
  return { ...PROTOCOL_TABLE[resolveProtocol(protocol)].capabilities };
}

export function isRecent(value: unknown, now: number): boolean {
  if (typeof value !== 'string' || !value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && now - time <= ONLINE_WINDOW_MS;
}

/** Computed at read time: the device answered recently and so did its agent. */
export function isGateOnline(
  gate: Record<string, unknown>,
  agent: Record<string, unknown> | null | undefined,
  now: number,
): boolean {
  return Boolean(
    agent && !agent['revokedAt'] && isRecent(agent['lastHeartbeatAt'], now) && isRecent(gate['lastSeenAt'], now),
  );
}

/** Day in Turkey (YYYYMMDD) for the given instant. */
export function istanbulYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function membershipValidEnd(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const date = new Date(endsAt);
  return Number.isNaN(date.getTime()) ? null : istanbulYmd(date);
}

export interface DesiredUserState {
  userId: string;
  name: string;
  card: string | null;
  validEnd: string | null;
  enabled: boolean;
}

export const DESIRED_FIELDS = ['userId', 'name', 'card', 'validEnd', 'enabled'] as const;

type MemberLike = Pick<
  GymMember,
  'memberNumber' | 'displayName' | 'rfidCardNumber' | 'membershipEndsAt' | 'membershipStatus' | 'isArchived'
> & { deletedAt?: string | null; archivedAt?: string | null };

/**
 * Desired device state for one member. Access is granted only to a live membership with a
 * member number whose end day (Turkey time) is today or later; the device keeps it valid until
 * the end of that day.
 */
export function computeDesiredState(member: MemberLike, now: Date): DesiredUserState {
  const userId = String(member.memberNumber ?? '').trim();
  const validEnd = membershipValidEnd(member.membershipEndsAt);
  const live =
    !member.deletedAt &&
    !member.isArchived &&
    !member.archivedAt &&
    (member.membershipStatus === 'active' || member.membershipStatus === 'trial');
  return {
    userId,
    name: String(member.displayName ?? '').trim(),
    card: member.rfidCardNumber?.trim() || null,
    validEnd,
    enabled: live && userId.length > 0 && validEnd !== null && validEnd >= istanbulYmd(now),
  };
}

export function sameDesiredState(current: Record<string, unknown> | null | undefined, next: DesiredUserState) {
  return Boolean(current) && DESIRED_FIELDS.every((field) => (current?.[field] ?? null) === next[field]);
}

export function syncDocId(gateId: string, memberId: string): string {
  return `${gateId}_${memberId}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return code;
}

export function normalizePairingCode(value: string): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

export function generateAgentToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Parses `Authorization: Agent <agentId>.<token>`. */
export function parseAgentAuthorization(header: string | undefined): { agentId: string; token: string } | null {
  if (!header?.startsWith('Agent ')) return null;
  const value = header.slice('Agent '.length).trim();
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  const agentId = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (!/^[A-Za-z0-9]{1,64}$/.test(agentId) || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  return { agentId, token };
}
