import { AIGeneratedSet, DomainId } from "@/engine/types";
import { db } from "./schema";
import { getToken, isCloudEnabled } from "@/api/client";
import { cloudAiGeneratedRepo } from "@/api/cloudRepos";

function useCloud(): boolean {
  return isCloudEnabled() && getToken() !== null;
}

export const aiGeneratedRepo = {
  async byKey(
    studentId: string,
    domain: DomainId,
    contentHash: string,
  ): Promise<AIGeneratedSet | undefined> {
    if (useCloud()) return cloudAiGeneratedRepo.byKey(studentId, domain, contentHash);
    const id = makeId(studentId, domain, contentHash);
    return db.aiGenerated.get(id);
  },

  async latestFor(
    studentId: string,
    domain: DomainId,
  ): Promise<AIGeneratedSet | undefined> {
    if (useCloud()) return cloudAiGeneratedRepo.latestFor(studentId, domain);
    const all = await db.aiGenerated
      .where("[studentId+domain]")
      .equals([studentId, domain])
      .toArray();
    if (all.length === 0) return undefined;
    return all.sort((a, b) => b.generatedAt - a.generatedAt)[0];
  },

  async save(set: AIGeneratedSet): Promise<void> {
    if (useCloud()) return cloudAiGeneratedRepo.save(set);
    await db.aiGenerated.put(set);
  },

  async clear(studentId: string, domain: DomainId): Promise<void> {
    const all = await db.aiGenerated
      .where("[studentId+domain]")
      .equals([studentId, domain])
      .primaryKeys();
    await db.aiGenerated.bulkDelete(all);
  },
};

export function makeId(studentId: string, domain: DomainId, hash: string): string {
  return `${studentId}::${domain}::${hash}`;
}
