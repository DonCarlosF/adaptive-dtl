/**
 * Cloud-backed implementations of the data repositories.
 *
 * These mirror the method surface of the local Dexie repos (studentRepo,
 * sessionRepo, aiGeneratedRepo). The repo modules delegate here when
 * `isCloudEnabled()` is true and a user is logged in, so call sites across
 * the app don't change.
 */
import {
  AIGeneratedSet,
  DomainId,
  SessionRecord,
  StudentProfile,
} from "@/engine/types";
import { apiFetch, ApiError } from "./client";

export const cloudStudentRepo = {
  async list(): Promise<StudentProfile[]> {
    const res = await apiFetch<{ students: StudentProfile[] }>("/api/students");
    return [...res.students].sort((a, b) => a.createdAt - b.createdAt);
  },

  async get(id: string): Promise<StudentProfile | undefined> {
    const all = await cloudStudentRepo.list();
    return all.find((s) => s.id === id);
  },

  async upsert(s: StudentProfile): Promise<void> {
    await apiFetch(`/api/students/${encodeURIComponent(s.id)}`, {
      method: "PUT",
      body: s,
    });
  },

  async remove(id: string): Promise<void> {
    await apiFetch(`/api/students/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

export const cloudSessionRepo = {
  async listForStudent(studentId: string): Promise<SessionRecord[]> {
    const res = await apiFetch<{ sessions: SessionRecord[] }>(
      `/api/students/${encodeURIComponent(studentId)}/sessions`,
    );
    // Most-recent-first, matching the local repo.
    return [...res.sessions].sort((a, b) => b.startedAt - a.startedAt);
  },

  async listForStudentAndDomain(
    studentId: string,
    domain: DomainId,
  ): Promise<SessionRecord[]> {
    const all = await cloudSessionRepo.listForStudent(studentId);
    return all
      .filter((s) => s.domain === domain)
      .sort((a, b) => a.startedAt - b.startedAt);
  },

  async save(rec: SessionRecord): Promise<void> {
    await apiFetch("/api/sessions", { method: "POST", body: rec });
  },
};

export const cloudAiGeneratedRepo = {
  async byKey(
    studentId: string,
    domain: DomainId,
    contentHash: string,
  ): Promise<AIGeneratedSet | undefined> {
    // Mirrors makeId() in aiGeneratedRepo — kept inline to avoid a cyclic import.
    const id = `${studentId}::${domain}::${contentHash}`;
    try {
      const res = await apiFetch<{ set: AIGeneratedSet } | undefined>(
        `/api/ai-sets/${encodeURIComponent(id)}`,
      );
      return res?.set;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  },

  async latestFor(
    studentId: string,
    domain: DomainId,
  ): Promise<AIGeneratedSet | undefined> {
    const res = await apiFetch<{ set: AIGeneratedSet } | undefined>(
      `/api/students/${encodeURIComponent(studentId)}/ai/${encodeURIComponent(
        domain,
      )}/latest`,
    );
    return res?.set;
  },

  async save(set: AIGeneratedSet): Promise<void> {
    await apiFetch(`/api/ai-sets/${encodeURIComponent(set.id)}`, {
      method: "PUT",
      body: set,
    });
  },
};
