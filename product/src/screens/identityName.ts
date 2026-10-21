/**
 * QA-03: the name committed on "Begin campaign" is the field's value *at
 * submit time*. Sources, freshest first:
 *   1. the live DOM value on web (catches a programmatic fill / paste /
 *      autofill whose change event React never delivered),
 *   2. the latest onChangeText value (a ref — never a stale render closure),
 *   3. the rendered state value.
 * No debounce anywhere on this path. Pure so it can be unit-tested.
 */
export type NameSources = {
  domValue?: unknown;
  latestTyped?: string | null;
  stateValue?: string | null;
};

export function resolveSubmittedName({ domValue, latestTyped, stateValue }: NameSources): string {
  for (const v of [domValue, latestTyped, stateValue]) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return typeof stateValue === 'string' ? stateValue : '';
}

/** Read `.value` off an RN-web TextInput host node (a DOM input); undefined on native. */
export function readHostValue(node: unknown): string | undefined {
  const v = (node as { value?: unknown } | null | undefined)?.value;
  return typeof v === 'string' ? v : undefined;
}
