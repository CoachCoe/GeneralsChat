import { z } from 'zod';

/**
 * Validation Schemas for API Routes
 *
 * Using Zod for runtime type validation
 */

// Chat API schemas
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000, 'Message is too long'),
  incidentId: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// Incident schemas
export const createIncidentSchema = z.object({
  reporterId: z.string().min(1, 'Reporter ID is required'),
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().min(1, 'Description is required').max(10000, 'Description is too long'),
  incidentType: z.enum([
    'bullying',
    'title_ix',
    'harassment',
    'violence',
    'substance',
    'other',
  ]).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).default('open'),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(10000).optional(),
  incidentType: z.enum([
    'bullying',
    'title_ix',
    'harassment',
    'violence',
    'substance',
    'other',
  ]).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

// Policy schemas
export const createPolicySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  content: z.string().optional(),
  filePath: z.string().optional(),
  policyType: z.enum(['federal', 'state', 'district', 'school']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  version: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  policyType: z.enum(['federal', 'state', 'district', 'school']).optional(),
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
  incidentId: z.string().optional(),
  uploadedBy: z.string().min(1, 'Uploader ID is required'),
});

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

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
