import { z } from 'zod';
import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  POLICY_CATEGORIES,
  POLICY_JURISDICTIONS,
  SEVERITIES,
} from '@/types';

const jurisdictionEnum = z.enum(POLICY_JURISDICTIONS);
const categoryEnum = z.enum(POLICY_CATEGORIES);

const incidentTypeEnum = z.enum(INCIDENT_TYPES);
const severityEnum = z.enum(SEVERITIES);
const incidentStatusEnum = z.enum(INCIDENT_STATUSES);

/**
 * Validation Schemas for API Routes
 *
 * Using Zod for runtime type validation
 */

// Chat API schemas
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000, 'Message is too long'),
  // `.nullish()`, not `.optional()`: the chat page holds incidentId in state
  // initialised to null and JSON.stringify emits `"incidentId": null`, so a
  // bare .optional() rejected the first message of every new conversation with
  // a 400 -- the opening turn of the primary journey. Caught by the e2e suite
  // once it had assertions that could fail.
  incidentId: z.string().min(1).nullish(),
  // No userId: identity comes from the session. Accepting it from the client
  // meant an attacker could forge reports as any named user. (SEC-8)
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// Incident schemas
export const createIncidentSchema = z.object({
  // reporterId is taken from the session, not the request body. (SEC-8)
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().min(1, 'Description is required').max(10000, 'Description is too long'),
  incidentType: incidentTypeEnum.optional(),
  severity: severityEnum.optional(),
  status: incidentStatusEnum.default('open'),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  status: incidentStatusEnum.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  incidentType: incidentTypeEnum.optional(),
  severity: severityEnum.optional(),
});

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

// Policy schemas
export const createPolicySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  content: z.string().optional(),
  filePath: z.string().optional(),
  jurisdiction: jurisdictionEnum,
  category: categoryEnum,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  version: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  jurisdiction: jurisdictionEnum.optional(),
  category: categoryEnum.optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  version: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;

// System Prompt schemas
export const createPromptSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  content: z.string().min(10, 'Content is required and must be at least 10 characters'),
  description: z.string().max(500, 'Description is too long').optional(),
  createdBy: z.string().optional(),
  isActive: z.boolean().default(false),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().min(10).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;

// File upload schema
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  fileType: z.string().min(1, 'File type is required'),
  fileSize: z.number().positive('File size must be positive').max(10 * 1024 * 1024, 'File is too large (max 10MB)'),
  // `.nullish()`, not `.optional()`: the chat page holds incidentId in state
  // initialised to null and JSON.stringify emits `"incidentId": null`, so a
  // bare .optional() rejected the first message of every new conversation with
  // a 400 -- the opening turn of the primary journey. Caught by the e2e suite
  // once it had assertions that could fail.
  incidentId: z.string().min(1).nullish(),
  uploadedBy: z.string().min(1, 'Uploader ID is required'),
});

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

/**
 * Pagination for list endpoints. `parseInt` with no bounds allowed
 * ?limit=1000000 to dump an entire table in one request, and ?limit=abc to
 * reach Prisma as `take: NaN`. (SEC-12)
 */
export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  // Garbage ("abc", 0, -1, 1.5) is rejected; an over-large but well-formed
  // limit is clamped rather than refused, so a caller asking for more than the
  // page cap gets the cap instead of a 400.
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(10)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Validate request body against a schema
 * Returns parsed data or throws with validation errors
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return { success: false, errors: result.error };
  }

  return { success: true, data: result.data };
}

/**
 * Format Zod validation errors for API responses
 */
export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(err.message);
  });

  return formatted;
}
