import React from 'react'
import { X } from 'lucide-react'

type SlideOverProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function SlideOver({ isOpen, onClose, title, children }: SlideOverProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 overflow-hidden">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-md w-full flex">
        <div className="w-full h-full bg-white dark:bg-neutral-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-neutral-800 transform transition-transform duration-300 ease-in-out">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-800 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 p-2 -mr-2 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
