import { StudentProfile } from "@/engine/types";
import { db } from "./schema";

export const studentRepo = {
  async list(): Promise<StudentProfile[]> {
    return db.students.orderBy("createdAt").toArray();
  },

  async get(id: string): Promise<StudentProfile | undefined> {
    return db.students.get(id);
  },

  async upsert(s: StudentProfile): Promise<void> {
    await db.students.put(s);
  },

  async remove(id: string): Promise<void> {
    await db.students.delete(id);
  },
};
