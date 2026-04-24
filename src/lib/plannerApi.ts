import { seedPlannerData } from '../data/seed'
import type { PlannerData } from '../types'

const storageKey = 'socialmedia-planning.workspace'

export type ImportedMarkdownFile = {
  name: string
  content: string
}

const clonePlanner = (data: PlannerData): PlannerData =>
  JSON.parse(JSON.stringify(data)) as PlannerData

function normalizePlanner(input: unknown): PlannerData {
  const planner = input as PlannerData
  if (planner?.schemaVersion === 2 && Array.isArray(planner.items)) {
    // Keep older items visible as Zettels. This also folds the removed
    // `reference` kind into the remaining Zettel/page model.
    return {
      ...planner,
      items: planner.items.map((item) =>
        item.kind === 'script' ? item : { ...item, kind: 'script' },
      ),
    }
  }

  return clonePlanner(seedPlannerData)
}

export async function loadPlanner(): Promise<PlannerData> {
  if (window.planner) {
    const saved = await window.planner.loadWorkspace()
    if (saved) {
      return normalizePlanner(saved)
    }

    const seeded = clonePlanner(seedPlannerData)
    return window.planner.saveWorkspace(seeded)
  }

  const saved = window.localStorage.getItem(storageKey)
  if (saved) {
    return normalizePlanner(JSON.parse(saved))
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

export async function pickImage(): Promise<string | null> {
  if (window.planner?.pickImage) {
    return window.planner.pickImage()
  }

  return null
}

export async function importMarkdownFiles(): Promise<ImportedMarkdownFile[]> {
  if (window.planner?.importMarkdownFiles) {
    return window.planner.importMarkdownFiles()
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown,text/x-markdown'
    input.multiple = true
    input.style.display = 'none'
    let settled = false

    const cleanup = () => {
      window.removeEventListener('focus', handleWindowFocus)
      input.removeEventListener('cancel', handleCancel)
      if (input.parentElement) {
        document.body.removeChild(input)
      }
    }

    const finish = (files: File[]) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      Promise.all(
        files
          .filter((file) => /\.(md|markdown)$/i.test(file.name))
          .map(async (file) => ({
            name: file.name,
            content: await file.text(),
          })),
      ).then(resolve)
    }

    const handleCancel = () => {
      finish([])
    }

    function handleWindowFocus() {
      window.setTimeout(() => {
        if (settled) {
          return
        }

        finish(Array.from(input.files ?? []))
      }, 300)
    }

    input.addEventListener(
      'change',
      () => {
        finish(Array.from(input.files ?? []))
      },
      { once: true },
    )
    input.addEventListener('cancel', handleCancel, { once: true })
    window.addEventListener('focus', handleWindowFocus)

    document.body.appendChild(input)
    input.click()
  })
}
