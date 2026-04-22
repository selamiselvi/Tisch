import type { PlannerData } from '../types'

declare global {
  interface Window {
    planner?: {
      getWorkspacePath: () => Promise<string>
      loadWorkspace: () => Promise<PlannerData | null>
      saveWorkspace: (data: PlannerData) => Promise<PlannerData>
    }
  }
}

export {}
