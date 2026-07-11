import { DomainId, SessionRecord } from "@/engine/types";
import { db } from "./schema";
import { getToken, isCloudEnabled } from "@/api/client";
import { cloudSessionRepo } from "@/api/cloudRepos";

function useCloud(): boolean {
  return isCloudEnabled() && getToken() !== null;
}

export const sessionRepo = {
  async listForStudent(studentId: string): Promise<SessionRecord[]> {
    if (useCloud()) return cloudSessionRepo.listForStudent(studentId);
    // Most-recent-first, matching the cloud repo. (An explicit sort: the
    // old reverse().sortBy().reverse() chain cancelled itself out and
    // returned oldest-first, which silently truncated the newest session
    // from capped lists once a student had 12+ sessions.)
    const rows = await db.sessions.where("studentId").equals(studentId).toArray();
    return rows.sort((a, b) => b.startedAt - a.startedAt);
  },

  async listForStudentAndDomain(
    studentId: string,
    domain: DomainId,
  ): Promise<SessionRecord[]> {
    if (useCloud())
      return cloudSessionRepo.listForStudentAndDomain(studentId, domain);
    const all = await db.sessions.where("studentId").equals(studentId).toArray();
    return all
      .filter((s) => s.domain === domain)
      .sort((a, b) => a.startedAt - b.startedAt);
  },

  async save(rec: SessionRecord): Promise<void> {
    if (useCloud()) return cloudSessionRepo.save(rec);
    await db.sessions.put(rec);
  },
};
