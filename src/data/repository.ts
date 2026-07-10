import type { PlanningCase } from "./types";

/**
 * Storage boundary for planning cases. LocalStorageRepository is the only
 * implementation today; swapping in a real backend later means writing a
 * second implementation of this interface, not touching call sites.
 */
export interface Repository {
  listCases(): Promise<PlanningCase[]>;
  getCase(id: string): Promise<PlanningCase | undefined>;
  saveCase(planningCase: PlanningCase): Promise<void>;
  deleteCase(id: string): Promise<void>;
}
