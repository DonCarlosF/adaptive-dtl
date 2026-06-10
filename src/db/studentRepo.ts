import { StudentProfile } from "@/engine/types";
import { db } from "./schema";
import { getToken, isCloudEnabled } from "@/api/client";
import { cloudStudentRepo } from "@/api/cloudRepos";

/** Use the cloud backend when configured and the teacher is logged in. */
function useCloud(): boolean {
  return isCloudEnabled() && getToken() !== null;
}

export const studentRepo = {
  async list(): Promise<StudentProfile[]> {
    if (useCloud()) return cloudStudentRepo.list();
    return db.students.orderBy("createdAt").toArray();
  },

  async get(id: string): Promise<StudentProfile | undefined> {
    if (useCloud()) return cloudStudentRepo.get(id);
    return db.students.get(id);
  },

  async upsert(s: StudentProfile): Promise<void> {
    if (useCloud()) return cloudStudentRepo.upsert(s);
    await db.students.put(s);
  },

  async remove(id: string): Promise<void> {
    if (useCloud()) return cloudStudentRepo.remove(id);
    await db.students.delete(id);
  },
};
