// Data Classification System
export enum DataSensitivity {
  PUBLIC = "public",        // Policies, general procedures
  INTERNAL = "internal",    // District-specific workflows
  CONFIDENTIAL = "confidential", // Student information, incidents
  RESTRICTED = "restricted" // Investigation details, personal data
}

/**
 * Single source of truth for the incident vocabularies. (DEAD-13)
 *
 * These lists were previously written out verbatim in validation.ts (twice),
 * in the typeLabels map in /api/chat, and here -- and the copies had already
 * drifted: this interface was missing "substance", which classifyIncident can
 * return and the chat route stores, papered over with `as any` in classifier.ts.
 */
export const INCIDENT_TYPES = [
  'bullying',
  'title_ix',
  'harassment',
  'violence',
  'substance',
  'other',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Matches the vocabulary documented at prisma/schema.prisma:55 and the
 * IncidentStatus enum below. validation.ts previously encoded a third,
 * conflicting set ('investigating' / 'resolved'); that has been reconciled
 * onto this one because the schema and the enum agree and are the data layer.
 * See FLOW-12 / SPEC-12 for the remaining UI-side mismatch.
 */
export const INCIDENT_STATUSES = [
  'open',
  'in_progress',
  'under_review',
  'completed',
  'closed',
] as const;
export type IncidentStatusValue = (typeof INCIDENT_STATUSES)[number];

// Incident Classification
export interface IncidentClassification {
  type: IncidentType;
  severity: Severity;
  requiredActions: Action[];
  timeline: ComplianceTimeline;
  stakeholders: string[];
}

// Compliance Timeline
export interface ComplianceTimeline {
  immediateActions: Action[]; // 0-24 hours
  shortTermActions: Action[]; // 1-5 days
  investigationPhase: Action[]; // 5-30 days
  reportingDeadlines: Date[];
  reviewMilestones: Date[];
}

// Action Interface
export interface Action {
  id: string;
  type: string;
  description: string;
  dueDate: Date;
  assignedTo?: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  evidenceFiles?: string[];
}

// Compliance Action
export interface ComplianceAction {
  id: string;
  incidentId: string;
  actionType: string;
  description?: string;
  dueDate?: Date;
  completedAt?: Date;
  assignedTo?: string;
  evidenceFiles?: string[];
  status: "pending" | "in_progress" | "completed" | "overdue";
  createdAt: Date;
  updatedAt: Date;
}

// User Roles
export enum UserRole {
  ADMIN = "admin",
  INVESTIGATOR = "investigator",
  REPORTER = "reporter"
}

// Policy Types
export enum PolicyType {
  FEDERAL = "federal",
  STATE = "state",
  DISTRICT = "district",
  SCHOOL = "school"
}

// Incident Status
export enum IncidentStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  UNDER_REVIEW = "under_review",
  COMPLETED = "completed",
  CLOSED = "closed"
}

// Conversation Message
export interface ConversationMessage {
  id: string;
  incidentId: string;
  message: string;
  sender: "user" | "assistant";
  timestamp: Date;
  metadata?: {
    citations?: string[];
    attachments?: string[];
    confidence?: number;
  };
}

// File Upload
export interface FileUpload {
  filename: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: Date;
}

// AI Response with Citations
export interface AIResponse {
  response: string;
  citations: string[];
  confidence: number;
  suggestedActions?: Action[];
  policyReferences?: string[];
}

// Incident Intake Flow
export interface IncidentIntakeFlow {
  initialQuestions: string[];
  followUpLogic: (responses: Record<string, string>) => string[];
  classificationRules: (responses: Record<string, string>) => IncidentClassification;
}

// Policy Document
export interface PolicyDocument {
  id: string;
  title: string;
  content?: string;
  filePath?: string;
  version: number;
  effectiveDate: Date;
  policyType: PolicyType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Policy Chunk for Vector Search
export interface PolicyChunk {
  id: string;
  policyId: string;
  content: string;
  chunkIndex: number;
  embedding?: number[];
  createdAt: Date;
}
