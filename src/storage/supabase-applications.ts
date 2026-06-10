import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../types/database.types.js";
import type { ProfileStore } from "./profiles.js";
import {
  DEFAULT_LIST_LIMIT,
  type Application,
  type ApplicationCreate,
  type ApplicationListFilter,
  type ApplicationStore,
  type ApplicationUpdate,
} from "./applications.js";

type Row = Tables<"applications">;

/**
 * Supabase-backed ApplicationStore. Resolves the Telegram uid to a profile (creating one on
 * create, so the FK holds) and reads/writes that profile's `applications` rows. Every query is
 * scoped to `profile_id`, so a user can only ever reach their own records.
 */
export class SupabaseApplicationStore implements ApplicationStore {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly profiles: ProfileStore,
  ) {}

  async create(uid: string, input: ApplicationCreate): Promise<Application> {
    const profileId = await this.profiles.upsert({ telegramId: uid });

    const insert: TablesInsert<"applications"> = {
      profile_id: profileId,
      company: input.company,
      ...toColumns(input),
    };

    const { data, error } = await this.db
      .from("applications")
      .insert(insert)
      .select()
      .single();

    if (error) throw new Error(`applications.create failed: ${error.message}`);
    return toApplication(data);
  }

  async list(uid: string, filter?: ApplicationListFilter): Promise<Application[]> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return [];

    const limit = filter?.limit && filter.limit > 0 ? filter.limit : DEFAULT_LIST_LIMIT;
    let query = this.db
      .from("applications")
      .select()
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (filter?.status) query = query.eq("status", filter.status);
    if (filter?.company) query = query.ilike("company", `%${filter.company}%`);

    const { data, error } = await query;
    if (error) throw new Error(`applications.list failed: ${error.message}`);
    return (data ?? []).map(toApplication);
  }

  async get(uid: string, id: string): Promise<Application | null> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return null;

    const { data, error } = await this.db
      .from("applications")
      .select()
      .eq("profile_id", profileId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`applications.get failed: ${error.message}`);
    return data ? toApplication(data) : null;
  }

  async update(uid: string, id: string, patch: ApplicationUpdate): Promise<Application | null> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return null;

    const update: TablesUpdate<"applications"> = {
      ...toColumns(patch),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.db
      .from("applications")
      .update(update)
      .eq("profile_id", profileId)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`applications.update failed: ${error.message}`);
    return data ? toApplication(data) : null;
  }

  async delete(uid: string, id: string): Promise<boolean> {
    const profileId = await this.profiles.resolveId(uid);
    if (!profileId) return false;

    const { data, error } = await this.db
      .from("applications")
      .delete()
      .eq("profile_id", profileId)
      .eq("id", id)
      .select("id");

    if (error) throw new Error(`applications.delete failed: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
}

/** Map the camelCase create/update shape to snake_case columns, omitting undefined fields. */
function toColumns(input: ApplicationCreate | ApplicationUpdate): TablesUpdate<"applications"> {
  const cols: TablesUpdate<"applications"> = {};
  if ("status" in input && input.status !== undefined) cols.status = input.status;
  if ("position" in input && input.position !== undefined) cols.position = input.position;
  if ("source" in input && input.source !== undefined) cols.source = input.source;
  if ("vacancyUrl" in input && input.vacancyUrl !== undefined) cols.vacancy_url = input.vacancyUrl;
  if ("location" in input && input.location !== undefined) cols.location = input.location;
  if ("workMode" in input && input.workMode !== undefined) cols.work_mode = input.workMode;
  if ("salaryNote" in input && input.salaryNote !== undefined) cols.salary_note = input.salaryNote;
  if ("notes" in input && input.notes !== undefined) cols.notes = input.notes;
  if ("interviewStages" in input && input.interviewStages !== undefined)
    cols.interview_stages = input.interviewStages;
  if ("appliedAt" in input && input.appliedAt !== undefined) cols.applied_at = input.appliedAt;
  // `company` is only ever set explicitly by callers (required on create, optional on update).
  if ("company" in input && input.company !== undefined) cols.company = input.company;
  return cols;
}

function toApplication(row: Row): Application {
  return {
    id: row.id,
    status: row.status,
    company: row.company,
    position: row.position,
    source: row.source,
    vacancyUrl: row.vacancy_url,
    location: row.location,
    workMode: row.work_mode,
    salaryNote: row.salary_note,
    notes: row.notes,
    interviewStages: row.interview_stages,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
