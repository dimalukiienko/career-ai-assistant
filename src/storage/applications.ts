import { randomUUID } from "node:crypto";
import type { Enums } from "../types/database.types.js";

/** Pipeline stage of an application; mirrors the `application_status` DB enum. */
export type ApplicationStatus = Enums<"application_status">;
/** Where the role is performed; mirrors the `work_mode` DB enum. */
export type WorkMode = Enums<"work_mode">;

/** A job application the user is tracking. Field names mirror the `applications` table. */
export interface Application {
  id: string;
  status: ApplicationStatus;
  company: string;
  position: string | null;
  source: string | null;
  vacancyUrl: string | null;
  location: string | null;
  workMode: WorkMode | null;
  salaryNote: string | null;
  notes: string | null;
  /** Ordered round names, e.g. ["phone screen", "onsite"]. Defaults to []. */
  interviewStages: string[];
  /** ISO timestamp the user actually applied, or null if not yet applied. */
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted on create. `company` is required; `status` defaults to 'saved' in the DB. */
export type ApplicationCreate = { company: string } & Partial<
  Omit<Application, "id" | "company" | "createdAt" | "updatedAt">
>;

/** Fields accepted on update; all optional (identity/timestamps are managed by the store). */
export type ApplicationUpdate = Partial<Omit<Application, "id" | "createdAt" | "updatedAt">>;

export interface ApplicationListFilter {
  status?: ApplicationStatus;
  /** Case-insensitive substring match on company. */
  company?: string;
  limit?: number;
}

/** Default/cap on how many rows `list` returns when no limit (or an out-of-range one) is given. */
export const DEFAULT_LIST_LIMIT = 50;

/**
 * Storage seam for job applications. The in-memory impl below is the test seam; the Supabase
 * impl (supabase-applications.ts) is the runtime default. All ops are scoped to one `uid`
 * (Telegram id) so a user can only ever see/touch their own records.
 */
export interface ApplicationStore {
  create(uid: string, input: ApplicationCreate): Promise<Application>;
  list(uid: string, filter?: ApplicationListFilter): Promise<Application[]>;
  get(uid: string, id: string): Promise<Application | null>;
  update(uid: string, id: string, patch: ApplicationUpdate): Promise<Application | null>;
  /** Returns true if a row was deleted, false if no matching row existed. */
  delete(uid: string, id: string): Promise<boolean>;
}

export class InMemoryApplicationStore implements ApplicationStore {
  private readonly byUid = new Map<string, Application[]>();

  async create(uid: string, input: ApplicationCreate): Promise<Application> {
    const now = new Date().toISOString();
    const app: Application = {
      id: randomUUID(),
      status: input.status ?? "saved",
      company: input.company,
      position: input.position ?? null,
      source: input.source ?? null,
      vacancyUrl: input.vacancyUrl ?? null,
      location: input.location ?? null,
      workMode: input.workMode ?? null,
      salaryNote: input.salaryNote ?? null,
      notes: input.notes ?? null,
      interviewStages: input.interviewStages ?? [],
      appliedAt: input.appliedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.byUid.get(uid) ?? [];
    list.push(app);
    this.byUid.set(uid, list);
    return { ...app };
  }

  async list(uid: string, filter?: ApplicationListFilter): Promise<Application[]> {
    const company = filter?.company?.toLowerCase();
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : DEFAULT_LIST_LIMIT;
    return (this.byUid.get(uid) ?? [])
      .filter((a) => (filter?.status ? a.status === filter.status : true))
      .filter((a) => (company ? a.company.toLowerCase().includes(company) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async get(uid: string, id: string): Promise<Application | null> {
    const app = (this.byUid.get(uid) ?? []).find((a) => a.id === id);
    return app ? { ...app } : null;
  }

  async update(uid: string, id: string, patch: ApplicationUpdate): Promise<Application | null> {
    const app = (this.byUid.get(uid) ?? []).find((a) => a.id === id);
    if (!app) return null;
    Object.assign(app, patch, { updatedAt: new Date().toISOString() });
    return { ...app };
  }

  async delete(uid: string, id: string): Promise<boolean> {
    const list = this.byUid.get(uid) ?? [];
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  }
}
