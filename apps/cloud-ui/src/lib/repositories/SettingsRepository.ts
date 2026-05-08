import type { Setting } from '../dexieDb'
import { DB } from '../dexieDb'

export const SettingsRepository = {
  getSetting(key: string): Promise<Setting['value'] | null> {
    return DB.getSetting(key)
  },

  setSetting(key: string, value: string): Promise<void> {
    return DB.setSetting(key, value)
  },
}
