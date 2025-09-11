// Data Classification System
export enum DataSensitivity {
  PUBLIC = "public",        // Policies, general procedures
  INTERNAL = "internal",    // District-specific workflows
  CONFIDENTIAL = "confidential", // Student information, incidents
  RESTRICTED = "restricted" // Investigation details, personal data
}

// Incident Classification
export interface IncidentClassification {
  type: "bullying" | "title_ix" | "harassment" | "violence" | "other";
  severity: "low" | "medium" | "high" | "critical";
  requiredActions: ComplianceAction[];
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
