import { z } from "zod";

// ─── Workspace ────────────────────────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * Parsed row from the ASCII table output of `multica workspace list`.
 * The CLI does NOT support --output json for this command.
 */
export interface WorkspaceRow {
  id: string;
  name: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;

// ─── Project Resource ─────────────────────────────────────────────────────────

export const ProjectResourceSchema = z.object({
  id: z.string().optional(),
  resource_type: z.string(),
  label: z.string().optional().nullable(),
  resource_ref: z
    .object({
      url: z.string().optional(),
    })
    .optional()
    .nullable(),
});

export type ProjectResource = z.infer<typeof ProjectResourceSchema>;

// ─── Runtime ─────────────────────────────────────────────────────────────────

export const RuntimeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mode: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(["online", "offline"]).optional(),
  last_seen: z.string().optional().nullable(),
});

export type Runtime = z.infer<typeof RuntimeSchema>;

// ─── Agent ───────────────────────────────────────────────────────────────────

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  runtime_id: z.string().optional().nullable(),
  visibility: z.string().optional().nullable(),
  max_concurrent_tasks: z.number().optional().nullable(),
  archived: z.boolean().optional().nullable(),
});

export type Agent = z.infer<typeof AgentSchema>;

// ─── Skill ───────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
});

export type Skill = z.infer<typeof SkillSchema>;

// ─── Issue ───────────────────────────────────────────────────────────────────

export const IssueStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
]);

export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const IssueSchema = z.object({
  id: z.string().min(1),
  number: z.number().optional().nullable(),
  title: z.string(),
  description: z.string().optional().nullable(),
  status: IssueStatusSchema.optional().nullable(),
  priority: z.string().optional().nullable(),
  assignee: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional()
    .nullable(),
  project_id: z.string().optional().nullable(),
  parent_id: z.string().optional().nullable(),
});

export type Issue = z.infer<typeof IssueSchema>;

// ─── Auth Status ──────────────────────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  user?: string;
}
