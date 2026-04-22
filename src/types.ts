export type ProjectId = 'launch-plan' | 'research' | 'operations' | 'lab'

export type ResourceKind = 'board' | 'canvas' | 'note' | 'card'

export interface Project {
  id: ProjectId
  name: string
  accent: string
  description: string
}

export interface BoardColumn {
  id: string
  title: string
}

export interface BoardCard {
  id: string
  title: string
  summary: string
  projectId: ProjectId
  columnId: string
  tags: string[]
  noteIds: string[]
  canvasIds: string[]
}

export interface Board {
  id: string
  title: string
  projectId: ProjectId
  description: string
  columns: BoardColumn[]
  cards: BoardCard[]
}

export interface CanvasNode {
  id: string
  title: string
  body: string
  kind: 'hook' | 'scene' | 'beat' | 'asset' | 'question'
  x: number
  y: number
  refs: ResourceRef[]
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface IdeaCanvas {
  id: string
  title: string
  projectId: ProjectId
  description: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface NoteDoc {
  id: string
  title: string
  projectId: ProjectId
  path: string
  tags: string[]
  linkedResourceIds: string[]
  content: string
}

export interface ResourceRef {
  kind: ResourceKind
  id: string
}

export interface PlannerLink {
  id: string
  from: ResourceRef
  to: ResourceRef
  label: string
}

export interface PlannerData {
  schemaVersion: 1
  updatedAt: string
  projects: Project[]
  boards: Board[]
  canvases: IdeaCanvas[]
  notes: NoteDoc[]
  links: PlannerLink[]
}
