import { seedPlannerData } from '../data/seed'
import type { PlannerData } from '../types'

const storageKey = 'socialmedia-planning.workspace'

const clonePlanner = (data: PlannerData): PlannerData =>
  JSON.parse(JSON.stringify(data)) as PlannerData

export async function loadPlanner(): Promise<PlannerData> {
  if (window.planner) {
    const saved = await window.planner.loadWorkspace()
    if (saved) {
      return saved
    }

    const seeded = clonePlanner(seedPlannerData)
    return window.planner.saveWorkspace(seeded)
  }

  const saved = window.localStorage.getItem(storageKey)
  if (saved) {
    return JSON.parse(saved) as PlannerData
  }

  const seeded = clonePlanner(seedPlannerData)
  window.localStorage.setItem(storageKey, JSON.stringify(seeded))
  return seeded
}

export async function savePlanner(data: PlannerData): Promise<PlannerData> {
  const next = {
    ...data,
    updatedAt: new Date().toISOString(),
  } satisfies PlannerData

  if (window.planner) {
    return window.planner.saveWorkspace(next)
  }

  window.localStorage.setItem(storageKey, JSON.stringify(next))
  return next
}

export async function getWorkspacePath(): Promise<string> {
  if (window.planner) {
    return window.planner.getWorkspacePath()
  }

  return 'Browser localStorage fallback'
}
