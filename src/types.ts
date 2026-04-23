export type ProjectId = string

export type ViewMode = 'page' | 'canvas' | 'board' | 'settings'

export type ItemKind = 'script'

export interface Project {
  id: ProjectId
  name: string
  accent: string
  description: string
}

export interface Item {
  id: string
  projectId: ProjectId
  title: string
  summary: string
  contentPath: string
  content: string
  tags: string[]
  status: string
  done: boolean
  imagePath?: string
  /**
   * 'script'     — Markdown page listed in the "Skripte" sidebar.
   * undefined    — canvas-only: exists as a node in a canvas but has not
   *                been promoted to its own page.
   */
  kind?: ItemKind
  createdAt: string
  updatedAt: string
}

export interface BoardColumn {
  id: string
  title: string
}

export interface BoardCard {
  id: string
  itemId: string
  columnId: string
}

export interface Board {
  id: string
  title: string
  projectId: ProjectId
  columns: BoardColumn[]
  cards: BoardCard[]
}

export interface CanvasNode {
  id: string
  itemId: string
  x: number
  y: number
  width?: number
  height?: number
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface IdeaCanvas {
  id: string
  title: string
  projectId: ProjectId
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface PlannerLink {
  id: string
  fromItemId: string
  toItemId: string
  label: string
}

export interface PlannerData {
  schemaVersion: 2
  updatedAt: string
  projects: Project[]
  items: Item[]
  boards: Board[]
  canvases: IdeaCanvas[]
  links: PlannerLink[]
}
