import type { Repository } from "./repository";
import type { PlanningCase } from "./types";

const STORAGE_KEY = "roofplan.cases";

function readAll(): Record<string, PlanningCase> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PlanningCase>;
  } catch {
    return {};
  }
}

function writeAll(cases: Record<string, PlanningCase>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

export class LocalStorageRepository implements Repository {
  async listCases(): Promise<PlanningCase[]> {
    return Object.values(readAll()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async getCase(id: string): Promise<PlanningCase | undefined> {
    return readAll()[id];
  }

  async saveCase(planningCase: PlanningCase): Promise<void> {
    const all = readAll();
    all[planningCase.id] = planningCase;
    writeAll(all);
  }

  async deleteCase(id: string): Promise<void> {
    const all = readAll();
    delete all[id];
    writeAll(all);
  }
}

export const repository: Repository = new LocalStorageRepository();
