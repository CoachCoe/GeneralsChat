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

/** Display labels, derived from the same list so they cannot drift. */
export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  bullying: 'Bullying',
  title_ix: 'Title IX',
  harassment: 'Harassment',
  violence: 'Violence',
  substance: 'Substance',
  other: 'Other',
};

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

/**
 * Where a policy comes from.
 *
 * Ordered weakest-to-strongest locality. Federal and state set the floor;
 * district and school implement it. Guidance should surface all of them,
 * because an administrator needs to know both the statutory requirement and
 * the local procedure that satisfies it.
 */
export const POLICY_JURISDICTIONS = ['federal', 'state', 'district', 'school'] as const;
export type PolicyJurisdiction = (typeof POLICY_JURISDICTIONS)[number];

export const JURISDICTION_LABELS: Record<PolicyJurisdiction, string> = {
  federal: 'Federal',
  state: 'State',
  district: 'District',
  school: 'School',
};

/**
 * What a policy is about. Independent of jurisdiction: there can be a federal,
 * a state, a district and a school policy all in the same category.
 */
export const POLICY_CATEGORIES = [
  'suicide_prevention',
  'mandatory_reporting',
  'restraint_seclusion',
  'title_ix',
  'discrimination',
  'bullying',
  'school_safety',
  'emergency_operations',
  'discipline',
  'student_health',
  'athletic_safety',
  'student_records',
  'enrollment',
  'attendance',
  'field_trips',
  'technology',
  'background_checks',
  'employee',
  'parental_rights',
  'chemical_safety',
  'other',
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/**
 * Indexed by plain string: category values arriving from the database are not
 * narrowed, and a row written before a category was added should still render
 * rather than crash.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  suicide_prevention: 'Suicide Prevention',
  mandatory_reporting: 'Mandatory Reporting',
  restraint_seclusion: 'Restraint & Seclusion',
  title_ix: 'Title IX',
  discrimination: 'Discrimination',
  bullying: 'Bullying',
  school_safety: 'School Safety',
  emergency_operations: 'Emergency Operations',
  discipline: 'Discipline',
  student_health: 'Student Health',
  athletic_safety: 'Athletic Safety',
  student_records: 'Student Records (FERPA)',
  enrollment: 'Enrollment',
  attendance: 'Attendance',
  field_trips: 'Field Trips',
  technology: 'Technology & Data',
  background_checks: 'Background Checks',
  employee: 'Employee',
  parental_rights: 'Parental Rights',
  chemical_safety: 'Chemical Safety',
  other: 'Other',
};

/**
 * Which policy categories an incident type implicates.
 *
 * mandatory_reporting is appended to every incident: "must I report this, to
 * whom, and by when" is the question the tool exists to answer, so those
 * obligations must be retrievable regardless of how the incident classified.
 */
const INCIDENT_TYPE_CATEGORIES: Record<IncidentType, PolicyCategory[]> = {
  bullying: ['bullying', 'discipline'],
  title_ix: ['title_ix', 'discrimination'],
  harassment: ['discrimination', 'title_ix', 'bullying'],
  violence: ['school_safety', 'discipline', 'emergency_operations'],
  substance: ['discipline', 'student_health'],
  other: [],
};

/**
 * Appended to every incident's category set, so its obligations are always
 * retrievable. Callers judging whether a *subject* is in the library must
 * exclude it -- it is nearly always covered locally, so including it would make
 * "nothing local for this subject" unreachable.
 */
export const ALWAYS_RETRIEVED_CATEGORY: PolicyCategory = 'mandatory_reporting';

export function categoriesForIncidentType(
  incidentType: string | null | undefined
): PolicyCategory[] {
  // Unknown or unclassified: return no categories, which callers treat as "no
  // filter". Narrowing to mandatory_reporting alone would silently exclude
  // every other policy on any turn where classification has not run.
  if (!incidentType || !(incidentType in INCIDENT_TYPE_CATEGORIES)) return [];

  const mapped = INCIDENT_TYPE_CATEGORIES[incidentType as IncidentType];
  // 'other' maps to nothing specific; do not constrain retrieval for it.
  if (mapped.length === 0) return [];

  return [...new Set([...mapped, 'mandatory_reporting' as PolicyCategory])];
}

/** @deprecated Use POLICY_JURISDICTIONS. Retained for existing imports. */
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
  jurisdiction: PolicyJurisdiction;
  category: PolicyCategory;
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
  /** Denormalised so retrieval can group and cite without a second query. */
  policy?: {
    title: string;
    jurisdiction: string;
    category: string;
  };
  /** The provision this chunk came from, when the document had structure. */
  sectionLabel?: string | null;
  sectionTitle?: string | null;
  sectionStatute?: string | null;
}

/** One policy cited in a response, with enough detail for the UI to show it. */
export interface PolicyCitation {
  policyId: string;
  title: string;
  jurisdiction: string;
  category: string;
  /**
   * Provisions of this policy the guidance actually rests on, formatted for
   * reading: "JICK §F — Investigative Procedures (RSA 193-F:4, II(k))".
   * Empty when the document has no parseable structure, in which case the
   * policy is cited whole.
   */
  sections?: string[];
}

/**
 * Which jurisdictions actually produced a policy for the categories an
 * incident implicates.
 *
 * A missing district or school entry is worth surfacing: local policy is
 * expected to implement the federal and state floor, so its absence is a real
 * compliance gap rather than a retrieval miss.
 */
export interface PolicyCoverage {
  /** Categories this incident implicates. */
  categories: string[];
  /** category -> jurisdictions that produced a policy for it. */
  byCategory: Record<string, string[]>;
  /**
   * Categories with federal or state authority but no district or school
   * policy implementing it. Local policy is expected to exist for everything,
   * so these are compliance gaps worth telling the administrator about --
   * distinct from "we retrieved nothing at all".
   */
  categoriesWithoutLocalPolicy: string[];
}

export const LOCAL_JURISDICTIONS: readonly string[] = ['district', 'school'];
