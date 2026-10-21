// Smoke-only stand-in for react-native / expo native modules so App.tsx can be
// loaded (all module top-levels executed) in plain Node. Any property is a
// callable, constructible stub; StyleSheet.create-style calls return their arg.
'use strict';
function make(name) {
  const fn = function stub() {};
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return make(name + '.default');
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;
      if (prop === 'OS') return 'android';
      if (prop === 'select') return (o) => (o && (o.android ?? o.native ?? o.default)) || undefined;
      if (prop === 'create' || prop === 'flatten' || prop === 'compose') return (a) => a;
      if (prop === 'hairlineWidth') return 1;
      if (prop === 'displayName' || prop === 'name') return name;
      return make(name + '.' + String(prop));
    },
    apply(_t, _this, args) {
      return args.length && typeof args[0] === 'object' ? args[0] : null;
    },
    construct() {
      return make(name + '()');
    },
  });
}

/** Module object with explicit named exports (esbuild's __toESM copies own keys). */
function moduleWith(names) {
  const out = { __esModule: true, default: make('default') };
  for (const n of names) out[n] = make(n);
  return out;
}
module.exports = { make, moduleWith };
