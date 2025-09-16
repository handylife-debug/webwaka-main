'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Keyboard, Zap, Eye, Settings, RotateCcw, Search, HelpCircle, Command } from 'lucide-react'
import { KeyboardShortcutsService, ShortcutBinding, ShortcutCategory, ShortcutAction } from '../../lib/keyboard-shortcuts-service'

interface KeyboardShortcutsCellProps {
  tenantId: string
  className?: string
  onShortcutAction?: (action: ShortcutAction) => void
}

export function KeyboardShortcutsCell({ tenantId, className, onShortcutAction }: KeyboardShortcutsCellProps) {
  const [shortcutsService] = useState(() => new KeyboardShortcutsService(tenantId))
  const [bindings, setBindings] = useState<ShortcutBinding[]>([])
  const [isEnabled, setIsEnabled] = useState(true)
  const [showOverlay, setShowOverlay] = useState(false)
  const [editingBinding, setEditingBinding] = useState<string | null>(null)
  const [recordingKeys, setRecordingKeys] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ShortcutCategory | 'all'>('all')
  const [analytics, setAnalytics] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [conflictMessage, setConflictMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  const recordingRef = useRef<string | null>(null)

  const handleShortcutAction = useCallback((action: ShortcutAction) => {
    // Track usage for analytics
    shortcutsService.trackShortcutUsage(action)
    
    // Handle built-in actions
    switch (action) {
      case 'help_overlay':
        setShowOverlay(prev => !prev)
        break
      case 'search_products':
        // Focus search input if available
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        break
      case 'new_sale':
        // Start new POS transaction
        onShortcutAction?.(action) || console.log('Starting new sale transaction')
        break
      case 'checkout':
        // Process checkout
        onShortcutAction?.(action) || console.log('Processing checkout')
        break
      case 'payment_cash':
      case 'payment_card':
        // Handle payment processing
        onShortcutAction?.(action) || console.log(`Processing ${action} payment`)
        break
      case 'void_transaction':
        // Cancel current transaction
        onShortcutAction?.(action) || console.log('Voiding current transaction')
        break
      case 'open_cash_drawer':
        // Open cash drawer
        onShortcutAction?.(action) || console.log('Opening cash drawer')
        break
      default:
        // Pass custom actions to parent component
        onShortcutAction?.(action)
        break
    }
  }, [onShortcutAction])

  useEffect(() => {
    loadShortcuts()
    loadAnalytics()
    loadSettings()
  }, [])

  useEffect(() => {
    if (isEnabled) {
      const cleanup = shortcutsService.registerGlobalShortcuts(handleShortcutAction)
      return cleanup
    }
  }, [isEnabled, bindings, handleShortcutAction])

  const loadShortcuts = async () => {
    setIsLoading(true)
    try {
      const allBindings = await shortcutsService.getAllShortcuts()
      setBindings(allBindings)
      
      const enabled = await shortcutsService.getGlobalEnabled()
      setIsEnabled(enabled)
    } catch (error) {
      console.error('Failed to load shortcuts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAnalytics = async () => {
    try {
      const data = await shortcutsService.getShortcutAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const data = await shortcutsService.getSettings()
      setSettings(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recordingKeys || !recordingRef.current) return

    e.preventDefault()
    e.stopPropagation()

    const key = e.key.toLowerCase()
    const newKeys = new Set(pressedKeys)
    
    // Add modifier keys
    if (e.ctrlKey) newKeys.add('ctrl')
    if (e.metaKey) newKeys.add('meta')
    if (e.altKey) newKeys.add('alt')
    if (e.shiftKey) newKeys.add('shift')
    
    // Add main key (ignore modifiers by themselves)
    if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
      newKeys.add(key)
    }

    setPressedKeys(newKeys)
  }, [recordingKeys, pressedKeys])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!recordingKeys || !recordingRef.current) return

    // If no main key is pressed (only modifiers), continue recording
    const hasMainKey = Array.from(pressedKeys).some(key => 
      !['ctrl', 'meta', 'alt', 'shift'].includes(key)
    )

    if (hasMainKey && pressedKeys.size > 0) {
      // Complete the recording
      const combination = Array.from(pressedKeys).sort().join('+')
      updateShortcut(recordingRef.current, combination)
      stopRecording()
    }
  }, [recordingKeys, pressedKeys])

  useEffect(() => {
    if (recordingKeys) {
      document.addEventListener('keydown', handleKeyDown, true)
      document.addEventListener('keyup', handleKeyUp, true)
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true)
        document.removeEventListener('keyup', handleKeyUp, true)
      }
    }
  }, [recordingKeys, handleKeyDown, handleKeyUp])

  const startRecording = (bindingId: string) => {
    recordingRef.current = bindingId
    setRecordingKeys(true)
    setPressedKeys(new Set())
    setEditingBinding(bindingId)
  }

  const stopRecording = () => {
    recordingRef.current = null
    setRecordingKeys(false)
    setPressedKeys(new Set())
    setEditingBinding(null)
  }

  const updateShortcut = async (bindingId: string, combination: string) => {
    try {
      await shortcutsService.updateShortcut(bindingId, { combination })
      await loadShortcuts()
      setConflictMessage('') // Clear any previous conflict message
    } catch (error) {
      console.error('Failed to update shortcut:', error)
      if (error instanceof Error && error.message.includes('already used')) {
        setConflictMessage(error.message)
        setTimeout(() => setConflictMessage(''), 5000) // Clear after 5 seconds
      }
    }
  }

  const toggleBinding = async (bindingId: string, enabled: boolean) => {
    try {
      await shortcutsService.updateShortcut(bindingId, { enabled })
      await loadShortcuts()
    } catch (error) {
      console.error('Failed to toggle binding:', error)
      if (error instanceof Error) {
        setConflictMessage(error.message)
        setTimeout(() => setConflictMessage(''), 5000)
      }
    }
  }

  const updateSettingValue = async (key: string, value: boolean) => {
    try {
      await shortcutsService.updateSettings({ [key]: value })
      await loadSettings()
    } catch (error) {
      console.error('Failed to update setting:', error)
    }
  }

  const resetToDefaults = async () => {
    try {
      await shortcutsService.resetToDefaults()
      await loadShortcuts()
    } catch (error) {
      console.error('Failed to reset shortcuts:', error)
    }
  }

  const toggleGlobalShortcuts = async (enabled: boolean) => {
    try {
      await shortcutsService.setGlobalEnabled(enabled)
      setIsEnabled(enabled)
    } catch (error) {
      console.error('Failed to toggle global shortcuts:', error)
    }
  }

  const getFilteredBindings = () => {
    return bindings.filter(binding => {
      const matchesSearch = binding.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           binding.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || binding.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }

  const formatKeyCombo = (combo: string) => {
    return combo.split('+').map(key => {
      // Capitalize and format key names
      switch (key.toLowerCase()) {
        case 'ctrl': return 'Ctrl'
        case 'meta': return '⌘'
        case 'alt': return 'Alt'
        case 'shift': return '⇧'
        case ' ': return 'Space'
        case 'arrowup': return '↑'
        case 'arrowdown': return '↓'
        case 'arrowleft': return '←'
        case 'arrowright': return '→'
        case 'enter': return '↵'
        case 'escape': return 'Esc'
        case 'backspace': return '⌫'
        case 'delete': return 'Del'
        case 'tab': return '⇥'
        default: return key.charAt(0).toUpperCase() + key.slice(1)
      }
    }).join(' + ')
  }

  const getCategoryColor = (category: ShortcutCategory) => {
    const colors = {
      pos: 'bg-blue-100 text-blue-800',
      navigation: 'bg-green-100 text-green-800',
      editing: 'bg-purple-100 text-purple-800',
      system: 'bg-gray-100 text-gray-800',
      custom: 'bg-orange-100 text-orange-800'
    }
    return colors[category as keyof typeof colors] || colors.system
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Loading Keyboard Shortcuts...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded w-3/4"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>
            Customize hotkeys for faster POS operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="shortcuts">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="shortcuts" className="space-y-6">
              {/* Conflict Message */}
              {conflictMessage && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
                  <span>{conflictMessage}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConflictMessage('')}
                    className="text-red-700 hover:text-red-900"
                  >
                    ×
                  </Button>
                </div>
              )}
              
              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="globalEnabled">Enable Shortcuts</Label>
                    <Switch
                      id="globalEnabled"
                      checked={isEnabled}
                      onCheckedChange={toggleGlobalShortcuts}
                    />
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOverlay(true)}
                    className="flex items-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Help
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefaults}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset Defaults
                </Button>
              </div>

              {/* Search and Filter */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="search">Search Shortcuts</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <Input
                      id="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name or description..."
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as any)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="pos">POS Operations</SelectItem>
                      <SelectItem value="navigation">Navigation</SelectItem>
                      <SelectItem value="editing">Editing</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Shortcuts List */}
              <div className="space-y-3">
                {getFilteredBindings().map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium">{binding.name}</div>
                          <div className="text-sm text-gray-600">{binding.description}</div>
                        </div>
                        <Badge className={getCategoryColor(binding.category)}>
                          {binding.category}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {editingBinding === binding.id ? (
                          <div className="flex items-center gap-2">
                            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded font-mono text-sm">
                              {pressedKeys.size > 0 ? formatKeyCombo(Array.from(pressedKeys).join('+')) : 'Press keys...'}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={stopRecording}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startRecording(binding.id)}
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-mono text-sm transition-colors"
                          >
                            {binding.combination ? formatKeyCombo(binding.combination) : 'Not set'}
                          </button>
                        )}
                      </div>

                      <Switch
                        checked={binding.enabled}
                        onCheckedChange={(enabled) => toggleBinding(binding.id, enabled)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {getFilteredBindings().length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Keyboard className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <div>No shortcuts found matching your criteria</div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Global Settings
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Visual Feedback</div>
                      <div className="text-sm text-gray-600">Show key press animations</div>
                    </div>
                    <Switch 
                      checked={settings?.visualFeedback ?? true}
                      onCheckedChange={(checked) => updateSettingValue('visualFeedback', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Sound Effects</div>
                      <div className="text-sm text-gray-600">Play sounds on shortcut use</div>
                    </div>
                    <Switch 
                      checked={settings?.soundEffects ?? false}
                      onCheckedChange={(checked) => updateSettingValue('soundEffects', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Help Overlay</div>
                      <div className="text-sm text-gray-600">Auto-show on first visit</div>
                    </div>
                    <Switch 
                      checked={settings?.showHelpOnFirstVisit ?? true}
                      onCheckedChange={(checked) => updateSettingValue('showHelpOnFirstVisit', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">Conflict Detection</div>
                      <div className="text-sm text-gray-600">Warn about duplicate bindings</div>
                    </div>
                    <Switch 
                      checked={settings?.conflictDetection ?? true}
                      onCheckedChange={(checked) => updateSettingValue('conflictDetection', checked)}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3">Import/Export</h4>
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        try {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = '.json'
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) {
                              const text = await file.text()
                              await shortcutsService.importConfiguration(text)
                              await loadShortcuts()
                              await loadSettings()
                            }
                          }
                          input.click()
                        } catch (error) {
                          console.error('Import failed:', error)
                        }
                      }}
                    >
                      Import Settings
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        try {
                          const config = await shortcutsService.exportConfiguration()
                          const blob = new Blob([config], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `keyboard-shortcuts-${new Date().toISOString().split('T')[0]}.json`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch (error) {
                          console.error('Export failed:', error)
                        }
                      }}
                    >
                      Export Settings
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              {analytics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">{analytics.totalShortcuts}</div>
                    <div className="text-sm text-blue-600">Total Shortcuts</div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">{analytics.activeShortcuts}</div>
                    <div className="text-sm text-green-600">Active Shortcuts</div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-purple-700">{analytics.usageCount}</div>
                    <div className="text-sm text-purple-600">Times Used Today</div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-medium">Most Used Shortcuts</h3>
                {analytics?.mostUsed?.map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-gray-600">{formatKeyCombo(item.combination)}</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {item.count} uses
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Help Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Command className="w-5 h-5" />
                Keyboard Shortcuts Help
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOverlay(false)}
              >
                Close
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(
                bindings
                  .filter(b => b.enabled && b.combination)
                  .reduce((acc, binding) => {
                    if (!acc[binding.category]) acc[binding.category] = []
                    acc[binding.category].push(binding)
                    return acc
                  }, {} as Record<string, ShortcutBinding[]>)
              ).map(([category, categoryBindings]) => {
                const shortcuts = categoryBindings as ShortcutBinding[]
                return (
                  <div key={category}>
                    <h3 className="font-medium mb-3 capitalize flex items-center gap-2">
                      <Badge className={getCategoryColor(category as ShortcutCategory)}>
                        {category}
                      </Badge>
                    </h3>
                    <div className="space-y-2">
                      {shortcuts.map((binding: ShortcutBinding) => (
                        <div key={binding.id} className="flex items-center justify-between text-sm">
                          <span>{binding.name}</span>
                          <code className="px-2 py-1 bg-gray-100 rounded font-mono">
                            {formatKeyCombo(binding.combination!)}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}