'use client'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useEffect } from 'react'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline' },
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[420px] px-4 py-3 focus:outline-none',
        'data-placeholder': placeholder || '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
  })

  // Sync external value changes (e.g. variable insertion, reset after send)
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex flex-col">
      <Toolbar editor={editor} />
      <div className="border-t border-gray-200 flex-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn =
    'px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed'
  const active = 'bg-gray-200 text-gray-900'
  const inactive = 'text-gray-600'

  function setLink() {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Adres URL:', previousUrl || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap gap-0.5 px-2 py-1.5 bg-gray-50">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${btn} font-bold ${editor.isActive('bold') ? active : inactive}`} title="Pogrubienie (Ctrl+B)">B</button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} italic ${editor.isActive('italic') ? active : inactive}`} title="Kursywa (Ctrl+I)">I</button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`${btn} underline ${editor.isActive('underline') ? active : inactive}`} title="Podkreślenie (Ctrl+U)">U</button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`${btn} line-through ${editor.isActive('strike') ? active : inactive}`} title="Przekreślenie">S</button>

      <span className="w-px bg-gray-300 mx-1 my-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`${btn} ${editor.isActive('heading', { level: 2 }) ? active : inactive}`} title="Nagłówek 2">H2</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`${btn} ${editor.isActive('heading', { level: 3 }) ? active : inactive}`} title="Nagłówek 3">H3</button>

      <span className="w-px bg-gray-300 mx-1 my-1" />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${btn} ${editor.isActive('bulletList') ? active : inactive}`} title="Lista punktowana">• Lista</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${btn} ${editor.isActive('orderedList') ? active : inactive}`} title="Lista numerowana">1. Lista</button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`${btn} ${editor.isActive('blockquote') ? active : inactive}`} title="Cytat">❝</button>

      <span className="w-px bg-gray-300 mx-1 my-1" />

      <button type="button" onClick={setLink}
        className={`${btn} ${editor.isActive('link') ? active : inactive}`} title="Wstaw link">🔗</button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={`${btn} ${inactive}`} title="Linia pozioma">―</button>

      <span className="w-px bg-gray-300 mx-1 my-1" />

      <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}
        className={`${btn} ${inactive}`} title="Cofnij (Ctrl+Z)">↶</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}
        className={`${btn} ${inactive}`} title="Ponów (Ctrl+Y)">↷</button>
    </div>
  )
}
