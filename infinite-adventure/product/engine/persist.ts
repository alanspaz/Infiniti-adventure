/**
 * Pluggable persistence for campaign saves.
 * Engine: MemoryPersistStore for tests.
 * App shell: AsyncStorage-backed PersistStore (see src/persist/).
 */
export interface PersistStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory PersistStore for tests and early bootstrapping. */
export class MemoryPersistStore implements PersistStore {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  /** Test helper: clear all keys. */
  clear(): void {
    this.map.clear();
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

export const SAVE_KEY_PREFIX = 'ia.save.';

/** Points at the campaign id used for Home continue after reload. */
export const ACTIVE_CAMPAIGN_KEY = 'ia.save.activeId';

export function campaignSaveKey(campaignId: string): string {
  return `${SAVE_KEY_PREFIX}${campaignId}`;
}
