'use client'
import React, { createContext, useContext, useState } from 'react'

type SidebarContextType = {
  isSidebarOpen: boolean
  setIsSidebarOpen: (val: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  return <SidebarContext.Provider value={{ isSidebarOpen, setIsSidebarOpen }}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within SidebarProvider')
  return context
}
