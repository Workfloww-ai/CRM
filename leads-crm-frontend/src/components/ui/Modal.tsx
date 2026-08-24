import React from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
  hideHeader?: boolean
}

export function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-md", hideHeader = false }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={`relative bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full ${maxWidth} mx-4 overflow-hidden border border-gray-200 dark:border-neutral-800 animate-in fade-in zoom-in-95 duration-200`}>
        {!hideHeader && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
