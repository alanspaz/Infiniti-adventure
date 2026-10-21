/**
 * QA-02: Tale composer key handling (pure, so smoke can check it).
 * Enter sends; Shift+Enter is a newline; IME composition never sends.
 */
export type ComposerKey = { key?: string; shiftKey?: boolean; isComposing?: boolean };

export function isComposerSubmitKey(ev: ComposerKey | null | undefined): boolean {
  return Boolean(ev && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing);
}

/** Native keyboard: Return = send (no newline); multiline stays for wrapping. */
export const COMPOSER_NATIVE_PROPS = {
  returnKeyType: 'send',
  submitBehavior: 'submit',
} as const;
