import { DomainId, SessionRecord } from "@/engine/types";
import { db } from "./schema";

export const sessionRepo = {
  async listForStudent(studentId: string): Promise<SessionRecord[]> {
    return db.sessions
      .where("studentId")
      .equals(studentId)
      .reverse()
      .sortBy("startedAt")
      .then((rows) => rows.reverse());
  },

  async listForStudentAndDomain(
    studentId: string,
    domain: DomainId,
  ): Promise<SessionRecord[]> {
    const all = await db.sessions.where("studentId").equals(studentId).toArray();
    return all
      .filter((s) => s.domain === domain)
      .sort((a, b) => a.startedAt - b.startedAt);
  },

  async save(rec: SessionRecord): Promise<void> {
    await db.sessions.put(rec);
  },
};
