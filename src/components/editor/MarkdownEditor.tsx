import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table/kit'
import { Markdown } from '@tiptap/markdown'
import {
  Bold,
  Braces,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pencil,
  Quote,
  Strikethrough,
  Table2,
  TextCursorInput,
} from 'lucide-react'

export type MarkdownMode = 'write' | 'source'

interface MarkdownEditorProps {
  content: string
  itemId: string
  mode: MarkdownMode
  onChange: (content: string) => void
  onModeChange: (mode: MarkdownMode) => void
}

function normalizeUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function cleanMarkdown(markdown: string) {
  return markdown.replace(/&nbsp;|&#160;/g, ' ').replace(/\n{3,}$/g, '\n\n')
}

function getMarkdown(editor: TiptapEditor) {
  return cleanMarkdown(editor.getMarkdown())
}

function insertLink(editor: TiptapEditor) {
  const previous = String(editor.getAttributes('link').href ?? '')
  const next = window.prompt('Link URL', previous)

  if (next === null) {
    return
  }

  const url = normalizeUrl(next)
  if (!url) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className={active ? 'md-tool active' : 'md-tool'}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="md-toolbar-divider" />
}

function FormatBar({
  editor,
  mode,
  onModeChange,
}: {
  editor: TiptapEditor | null
  mode: MarkdownMode
  onModeChange: (mode: MarkdownMode) => void
}) {
  const isSource = mode === 'source'
  const disabled = !editor || isSource

  return (
    <div className="md-formatbar" role="toolbar" aria-label="Markdown Werkzeuge">
      <ToolbarButton
        active={mode === 'write'}
        label="Schreiben"
        onClick={() => onModeChange('write')}
      >
        <Pencil size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={mode === 'source'}
        label="Markdown-Quelle"
        onClick={() => onModeChange('source')}
      >
        <TextCursorInput size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor?.isActive('bold')}
        disabled={disabled}
        label="Fett"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('italic')}
        disabled={disabled}
        label="Kursiv"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('strike')}
        disabled={disabled}
        label="Durchgestrichen"
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor?.isActive('heading', { level: 1 })}
        disabled={disabled}
        label="Ueberschrift 1"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('heading', { level: 2 })}
        disabled={disabled}
        label="Ueberschrift 2"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('heading', { level: 3 })}
        disabled={disabled}
        label="Ueberschrift 3"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor?.isActive('bulletList')}
        disabled={disabled}
        label="Liste"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('orderedList')}
        disabled={disabled}
        label="Nummerierte Liste"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('taskList')}
        disabled={disabled}
        label="Taskliste"
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <ListChecks size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('blockquote')}
        disabled={disabled}
        label="Zitat"
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('codeBlock')}
        disabled={disabled}
        label="Codeblock"
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        <Braces size={16} />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label="Trennlinie"
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      >
        <Minus size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor?.isActive('link')}
        disabled={disabled}
        label="Link"
        onClick={() => editor && insertLink(editor)}
      >
        <Link2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor?.isActive('table')}
        disabled={disabled}
        label="Tabelle"
        onClick={() =>
          editor
            ?.chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <Table2 size={16} />
      </ToolbarButton>
    </div>
  )
}

export function MarkdownEditor({
  content,
  itemId,
  mode,
  onChange,
  onModeChange,
}: MarkdownEditorProps) {
  const lastEmitted = useRef(content)
  const [toolbarVersion, setToolbarVersion] = useState(0)
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
        link: false,
      }),
      Placeholder.configure({
        placeholder: 'Schreib los...',
      }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TableKit.configure({
        table: {
          resizable: false,
        },
      }),
      Markdown.configure({}),
    ],
    [],
  )

  const editor: TiptapEditor | null = useEditor({
    content,
    contentType: 'markdown',
    extensions,
    editorProps: {
      attributes: {
        class: 'prose markdown-prose',
        spellcheck: 'true',
      },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== 'text' || !(event.metaKey || event.ctrlKey)) {
          return false
        }

        const link = editor?.getAttributes('link').href
        if (typeof link === 'string' && link) {
          window.open(link, '_blank', 'noopener,noreferrer')
          return true
        }

        return false
      },
    },
    onSelectionUpdate: () => setToolbarVersion((version) => version + 1),
    onTransaction: () => setToolbarVersion((version) => version + 1),
    onUpdate: ({ editor: updatedEditor }) => {
      const markdown = getMarkdown(updatedEditor)
      lastEmitted.current = markdown
      onChange(markdown)
    },
  })

  useEffect(() => {
    if (!editor || mode !== 'write') {
      return
    }

    const current = getMarkdown(editor)
    if (current !== content) {
      editor.commands.setContent(content || '', {
        contentType: 'markdown',
        emitUpdate: false,
      })
      lastEmitted.current = content
    }
  }, [content, editor, itemId, mode])

  return (
    <div className="markdown-editor" data-toolbar-version={toolbarVersion}>
      <FormatBar editor={editor} mode={mode} onModeChange={onModeChange} />

      {mode === 'source' ? (
        <textarea
          className="markdown-source"
          spellCheck
          value={content}
          onChange={(event) => {
            lastEmitted.current = event.target.value
            onChange(event.target.value)
          }}
        />
      ) : (
        <div className="markdown-scroll">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  )
}
