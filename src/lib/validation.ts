import { z } from 'zod';
import {
  DOCUMENT_KINDS,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  POLICY_CATEGORIES,
  POLICY_JURISDICTIONS,
  SEVERITIES,
} from '@/types';

const jurisdictionEnum = z.enum(POLICY_JURISDICTIONS);
const categoryEnum = z.enum(POLICY_CATEGORIES);
const documentKindEnum = z.enum(DOCUMENT_KINDS);

const incidentTypeEnum = z.enum(INCIDENT_TYPES);
const severityEnum = z.enum(SEVERITIES);
const incidentStatusEnum = z.enum(INCIDENT_STATUSES);

/**
 * Validation Schemas for API Routes
 *
 * Using Zod for runtime type validation
 */

export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000, 'Message is too long'),
  // `.nullish()`, not `.optional()`: the chat page holds incidentId in state
  // initialised to null and JSON.stringify emits `"incidentId": null`, so a
  // bare .optional() rejected the first message of every new conversation with
  // a 400 -- the opening turn of the primary journey. Caught by the e2e suite
  // once it had assertions that could fail.
  incidentId: z.string().min(1).nullish(),
  // No userId: identity comes from the session. Accepting it from the client
  // meant an attacker could forge reports as any named user.
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export const createIncidentSchema = z.object({
  // reporterId is taken from the session, not the request body.
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

/**
 * A partial policy update. Every field is optional, but a field that is
 * present must be valid: on this path a bad value replaces a good one on a row
 * that already exists, where a create would simply fail to make one.
 *
 * `.strict()` because an unknown key is a caller expecting a field to be
 * applied that this route does not apply -- `version` among them. Accepting it
 * and dropping it is how a caller comes to believe a write happened.
 */
export const updatePolicySchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Title is too long').optional(),
    content: z.string().optional(),
    jurisdiction: jurisdictionEnum.optional(),
    category: categoryEnum.optional(),
    documentKind: documentKindEnum.optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
      // The regex admits 2026-02-30, which `new Date` silently rolls forward to
      // 1 March rather than rejecting. Round-tripping is what catches it.
      .refine(
        v => new Date(v).toISOString().slice(0, 10) === v,
        'Not a date on the calendar'
      )
      .optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const createPromptSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  content: z.string().min(10, 'Content is required and must be at least 10 characters'),
  description: z.string().max(500, 'Description is too long').optional(),
  isActive: z.boolean().default(false),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;

/**
 * The single advisor profile write. `name` is optional because the editor does
 * not offer one: there is only ever one profile, so naming it is not a choice
 * the product asks an admin to make. `DEFAULT_PROFILE_NAME` fills it in.
 */
export const saveActiveProfileSchema = z
  .object({
    content: z.string().min(10, 'The profile needs at least 10 characters'),
    name: z.string().min(1).max(100).optional(),
  })
  .strict();

export const updatePromptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().min(10).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;

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
 * reach Prisma as `take: NaN`.
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

/**
 * Parse a policy's jurisdiction and category from an untrusted request.
 *
 * Taking these straight from the body and defaulting the misses
 * (`|| 'district'`, `|| 'other'`) is worse than rejecting: a policy stored
 * under a category retrieval does not match is never returned,
 * AND -- because assessCoverage queries the same field -- the system then tells
 * the administrator the district holds no policy for that area. A typo turns a
 * loaded policy into a reported coverage gap. A bad jurisdiction is worse
 * still: buildJurisdictionContext groups only over the known four, so the text
 * is dropped from the model's context while buildCitations still lists it as a
 * source. Neither may be guessed.
 */
export const policyFacetsSchema = z.object({
  jurisdiction: jurisdictionEnum,
  category: categoryEnum,
  documentKind: documentKindEnum.default('policy'),
});

export type PolicyFacets = z.infer<typeof policyFacetsSchema>;
