import type { PlannerData } from '../types'
import type { ImportedMarkdownFile } from '../lib/plannerApi'

declare global {
  interface Window {
    planner?: {
      getWorkspacePath: () => Promise<string>
      loadWorkspace: () => Promise<PlannerData | null>
      saveWorkspace: (data: PlannerData) => Promise<PlannerData>
      pickImage: () => Promise<string | null>
      importMarkdownFiles: () => Promise<ImportedMarkdownFile[]>
      onWorkspaceChanged?: (callback: () => void) => () => void
    }
  }
}

export {}
