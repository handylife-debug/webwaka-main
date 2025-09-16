'use client'

import React, { useState, useEffect, createContext, useContext } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Moon, Sun, Monitor, Palette, Settings, Clock, Eye } from 'lucide-react'
import { DarkModeService, ThemeMode, ThemePreferences, ColorScheme } from '../../lib/dark-mode-service'

// Theme Context for global theme state
interface ThemeContextType {
  isDark: boolean
  themeMode: ThemeMode
  colorScheme: ColorScheme
  preferences: ThemePreferences | null
  systemPrefersDark: boolean
  toggleTheme: () => void
  setThemeMode: (mode: ThemeMode) => void
  setColorScheme: (scheme: ColorScheme) => void
  updatePreference: (field: keyof ThemePreferences, value: any) => void
  resetToDefaults: () => Promise<void>
  darkModeService: DarkModeService
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

// Theme Provider Component
interface ThemeProviderProps {
  children: React.ReactNode
  tenantId: string
}

export function ThemeProvider({ children, tenantId }: ThemeProviderProps) {
  const [darkModeService] = useState(() => new DarkModeService(tenantId))
  const [preferences, setPreferences] = useState<ThemePreferences | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [systemPrefersDark, setSystemPrefersDark] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load initial preferences and setup
  useEffect(() => {
    loadThemePreferences()
    const cleanupSystemListener = setupSystemThemeListener()
    
    // Cleanup on unmount
    return () => {
      darkModeService.stopAutoSchedule()
      if (cleanupSystemListener) {
        cleanupSystemListener()
      }
    }
  }, [])

  // Apply theme whenever preferences or system preference changes
  useEffect(() => {
    if (preferences) {
      applyTheme(preferences, systemPrefersDark)
      setupAutoSchedule(preferences)
    }
  }, [preferences, systemPrefersDark])

  const loadThemePreferences = async () => {
    try {
      const prefs = await darkModeService.getThemePreferences()
      setPreferences(prefs)
    } catch (error) {
      console.error('Failed to load theme preferences:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const setupSystemThemeListener = () => {
    // Initial system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemPrefersDark(mediaQuery.matches)
    
    // Listen for system theme changes with proper cleanup
    const cleanup = darkModeService.onSystemThemeChange((isDark: boolean) => {
      setSystemPrefersDark(isDark)
    })
    
    // Store cleanup function for component unmount
    return cleanup
  }

  const applyTheme = (prefs: ThemePreferences, systemDark: boolean) => {
    // Use the service's comprehensive applyTheme method
    darkModeService.applyTheme(prefs, systemDark)
    
    // Update local state
    const shouldBeDark = darkModeService.shouldUseDarkMode(prefs, systemDark)
    setIsDark(shouldBeDark)
  }

  const setupAutoSchedule = (prefs: ThemePreferences) => {
    // Stop existing schedule
    darkModeService.stopAutoSchedule()
    
    // Start new schedule if enabled
    if (prefs.autoSchedule) {
      darkModeService.startAutoSchedule(() => {
        // Theme change triggered by schedule - reapply theme
        applyTheme(prefs, systemPrefersDark)
      })
    }
  }

  const updatePreference = async (field: keyof ThemePreferences, value: any) => {
    if (!preferences) return
    
    const updatedPrefs = { ...preferences, [field]: value }
    setPreferences(updatedPrefs)
    
    try {
      await darkModeService.updateThemePreferences(updatedPrefs)
      
      // Update auto-schedule if schedule-related preferences changed
      if (['autoSchedule', 'darkStartTime', 'lightStartTime'].includes(field)) {
        darkModeService.updateAutoSchedule()
      }
    } catch (error) {
      console.error('Failed to update preference:', error)
    }
  }

  const toggleTheme = async () => {
    if (!preferences) return
    
    const newMode: ThemeMode = preferences.mode === 'light' ? 'dark' : 'light'
    await updatePreference('mode', newMode)
  }

  const setThemeMode = async (mode: ThemeMode) => {
    await updatePreference('mode', mode)
  }

  const setColorScheme = async (scheme: ColorScheme) => {
    await updatePreference('colorScheme', scheme)
  }

  const resetToDefaults = async () => {
    try {
      await darkModeService.resetToDefaults()
      await loadThemePreferences()
    } catch (error) {
      console.error('Failed to reset preferences:', error)
    }
  }

  const contextValue: ThemeContextType = {
    isDark,
    themeMode: preferences?.mode || 'system',
    colorScheme: preferences?.colorScheme || 'default',
    preferences,
    systemPrefersDark,
    toggleTheme,
    setThemeMode,
    setColorScheme,
    updatePreference,
    resetToDefaults,
    darkModeService
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {isLoading ? <div className="animate-pulse">{children}</div> : children}
    </ThemeContext.Provider>
  )
}

// Dark Mode Cell Component - Self-contained with internal ThemeProvider
interface DarkModeCellProps {
  tenantId: string
  className?: string
  showAdvanced?: boolean
}

export function DarkModeCell({ tenantId, className, showAdvanced = false }: DarkModeCellProps) {
  return (
    <ThemeProvider tenantId={tenantId}>
      <DarkModeCellInner className={className} showAdvanced={showAdvanced} />
    </ThemeProvider>
  )
}

// Internal component that uses the theme context
interface DarkModeCellInnerProps {
  className?: string
  showAdvanced?: boolean
}

function DarkModeCellInner({ className, showAdvanced = false }: DarkModeCellInnerProps) {
  // Use theme context exclusively - single source of truth
  const { 
    isDark, 
    themeMode, 
    colorScheme, 
    preferences, 
    systemPrefersDark, 
    setThemeMode, 
    setColorScheme, 
    updatePreference, 
    resetToDefaults,
    darkModeService 
  } = useTheme()

  const [analytics, setAnalytics] = useState<any>(null)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const data = await darkModeService.getThemeAnalytics()
      setAnalytics(data)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }

  const getCurrentTheme = () => {
    if (!preferences) return 'system'
    
    if (preferences.mode === 'system') {
      return systemPrefersDark ? 'dark' : 'light'
    }
    
    return preferences.mode
  }

  // No loading state needed - context handles loading
  if (!preferences) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            Loading Dark Mode Settings...
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
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getCurrentTheme() === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          Dark Mode Settings
        </CardTitle>
        <CardDescription>
          Customize your visual experience with theme preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <div>
              <div className="font-medium">Current Theme</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {getCurrentTheme() === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}
              </div>
            </div>
          </div>
          <Badge variant={getCurrentTheme() === 'dark' ? 'default' : 'outline'}>
            {getCurrentTheme() === 'dark' ? 'Dark' : 'Light'}
          </Badge>
        </div>

        {/* Theme Mode Selection */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Theme Mode</Label>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Sun className="w-4 h-4" />
                <div>
                  <div className="font-medium">Light</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">Always use light theme</div>
                </div>
              </div>
              <Switch
                checked={preferences.mode === 'light'}
                onCheckedChange={() => setThemeMode('light')}
              />
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Moon className="w-4 h-4" />
                <div>
                  <div className="font-medium">Dark</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">Always use dark theme</div>
                </div>
              </div>
              <Switch
                checked={preferences.mode === 'dark'}
                onCheckedChange={() => setThemeMode('dark')}
              />
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4" />
                <div>
                  <div className="font-medium">System</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Follow system preference ({systemPrefersDark ? 'dark' : 'light'})
                  </div>
                </div>
              </div>
              <Switch
                checked={preferences.mode === 'system'}
                onCheckedChange={() => setThemeMode('system')}
              />
            </div>
          </div>
        </div>

        {/* Auto Schedule */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="autoSchedule" className="text-base font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Auto Schedule
            </Label>
            <Switch
              id="autoSchedule"
              checked={preferences.autoSchedule ?? false}
              onCheckedChange={(checked) => updatePreference('autoSchedule', checked)}
            />
          </div>
          
          {preferences!.autoSchedule && (
            <div className="grid grid-cols-2 gap-4 ml-6">
              <div>
                <Label htmlFor="darkStart" className="text-sm">Dark starts at</Label>
                <input
                  id="darkStart"
                  type="time"
                  value={preferences?.darkStartTime || '20:00'}
                  onChange={(e) => updatePreference('darkStartTime', e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <Label htmlFor="lightStart" className="text-sm">Light starts at</Label>
                <input
                  id="lightStart"
                  type="time"
                  value={preferences?.lightStartTime || '06:00'}
                  onChange={(e) => updatePreference('lightStartTime', e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-medium flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Advanced Settings
            </h3>
            
            {/* Color Scheme */}
            <div className="space-y-2">
              <Label htmlFor="colorScheme" className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Color Scheme
              </Label>
              <Select 
                value={preferences.colorScheme || 'default'}
                onValueChange={(value: string) => setColorScheme(value as ColorScheme)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="purple">Purple</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Smooth Transitions */}
            <div className="flex items-center justify-between">
              <Label htmlFor="smoothTransitions" className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Smooth Transitions
              </Label>
              <Switch
                id="smoothTransitions"
                checked={preferences.smoothTransitions ?? true}
                onCheckedChange={(checked) => updatePreference('smoothTransitions', checked)}
              />
            </div>

            {/* High Contrast */}
            <div className="flex items-center justify-between">
              <Label htmlFor="highContrast">High Contrast Mode</Label>
              <Switch
                id="highContrast"
                checked={preferences.highContrast ?? false}
                onCheckedChange={(checked) => updatePreference('highContrast', checked)}
              />
            </div>

            {/* Analytics */}
            {analytics && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Usage Statistics</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600 dark:text-gray-300">Light Mode</div>
                    <div className="font-medium">{analytics.lightModeUsage}%</div>
                  </div>
                  <div>
                    <div className="text-gray-600 dark:text-gray-300">Dark Mode</div>
                    <div className="font-medium">{analytics.darkModeUsage}%</div>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Button */}
            <Button 
              variant="outline" 
              onClick={resetToDefaults}
              className="w-full"
            >
              Reset to Defaults
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}