import { tool } from "ai";
import { z } from "zod";
import type { Deps } from "../../deps.js";
import type { UserContext } from "./shared.js";

const STATUS = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

const WORK_MODE = ["onsite", "remote", "hybrid"] as const;

// Optional fields shared by create and update. `appliedAt` is an ISO timestamp.
const editableFields = {
  position: z.string().optional().describe("Role title, e.g. 'Senior Backend Engineer'"),
  source: z.string().optional().describe("Where the lead came from, e.g. 'LinkedIn', 'referral'"),
  vacancyUrl: z.string().optional().describe("Link to the job posting"),
  location: z.string().optional().describe("City/region of the role"),
  workMode: z.enum(WORK_MODE).optional(),
  salaryNote: z.string().optional().describe("Free-form pay note, e.g. '€90-110k'"),
  notes: z.string().optional().describe("Any other notes about the application"),
  interviewStages: z
    .array(z.string())
    .optional()
    .describe("Ordered interview round names, e.g. ['phone screen', 'onsite', 'final']"),
  appliedAt: z
    .string()
    .optional()
    .describe("When the user applied, ISO 8601 (e.g. 2026-06-10T00:00:00Z)"),
};

/** Job-application CRUD tools. These touch only our own DB, so no Google auth is involved. */
export function applicationTools(ctx: UserContext, deps: Deps) {
  return {
    create_application: tool({
      description:
        "Create a job application record for the user. Only 'company' is required; fill in " +
        "whatever else the user mentioned. Status defaults to 'saved' if not given.",
      inputSchema: z.object({
        company: z.string().describe("Company name (required)"),
        status: z.enum(STATUS).optional(),
        ...editableFields,
      }),
      execute: async (input) => {
        const application = await deps.applications.create(ctx.uid, input);
        return { status: "ok" as const, application };
      },
    }),

    list_applications: tool({
      description:
        "List the user's job applications, most recently updated first. Optionally filter by " +
        "status or by a company name substring.",
      inputSchema: z.object({
        status: z.enum(STATUS).optional(),
        company: z.string().optional().describe("Case-insensitive substring match on company"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, company, limit }) => {
        const applications = await deps.applications.list(ctx.uid, { status, company, limit });
        return { status: "ok" as const, count: applications.length, applications };
      },
    }),

    get_application: tool({
      description: "Fetch one job application by its id.",
      inputSchema: z.object({ id: z.string().describe("Application id (uuid)") }),
      execute: async ({ id }) => {
        const application = await deps.applications.get(ctx.uid, id);
        if (!application) return { status: "not_found" as const, id };
        return { status: "ok" as const, application };
      },
    }),

    update_application: tool({
      description:
        "Update fields on an existing job application (e.g. move its status, add interview " +
        "stages, set salary notes). Identify it by id; only the given fields change.",
      inputSchema: z.object({
        id: z.string().describe("Application id (uuid)"),
        company: z.string().optional(),
        status: z.enum(STATUS).optional(),
        ...editableFields,
      }),
      execute: async ({ id, ...patch }) => {
        const application = await deps.applications.update(ctx.uid, id, patch);
        if (!application) return { status: "not_found" as const, id };
        return { status: "ok" as const, application };
      },
    }),

    delete_application: tool({
      description:
        "Permanently delete a job application by id. Confirm with the user before calling this.",
      inputSchema: z.object({ id: z.string().describe("Application id (uuid)") }),
      execute: async ({ id }) => {
        const deleted = await deps.applications.delete(ctx.uid, id);
        if (!deleted) return { status: "not_found" as const, id };
        return { status: "ok" as const, deleted: true };
      },
    }),
  };
}
