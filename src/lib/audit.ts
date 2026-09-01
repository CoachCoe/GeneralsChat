import { prisma } from '@/lib/db';
import { logAudit, logError } from '@/lib/logger';

/**
 * Durable audit trail.
 *
 * prisma/schema.prisma comments the AuditLog table "for FERPA compliance", but
 * nothing ever wrote a row -- logAudit only emitted an ephemeral pino line. The
 * district therefore could not answer "who accessed this student's Title IX
 * file", which is the core disclosure-accounting obligation, and could not
 * scope a breach after the fact. (SEC-17, SPEC-13, DEAD-33)
 */
export type AuditAction = 'created' | 'updated' | 'deleted' | 'viewed' | 'exported';

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Writes the row and mirrors it to the structured log.
 *
 * Deliberately never throws: an audit write failing must not take down the
 * request that succeeded. Failures are logged so they are still visible.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const { userId, action, entity, entityId, details } = entry;

  logAudit(userId, action, entity, entityId ?? '', details);

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    logError(error as Error, {
      operation: 'recordAudit',
      action,
      entity,
      entityId,
    });
  }
}
