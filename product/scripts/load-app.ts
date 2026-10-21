/**
 * QA-01 nice-to-have: load App.tsx for real in Node (smoke). Bundles App.tsx
 * with esbuild, swapping react-native / expo native modules for a callable
 * stub, then executes every module top-level (engine, screens, styles, image
 * tables). Throws on any load-time error.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const NATIVE = /^(?:react-native(?:-[\w-]+)?|@react-native[\w-]*\/[\w./-]+|expo(?:-[\w-]+)?|@expo\/[\w./-]+)(?:\/[\w./-]*)?$/;

function importedNames(root: string): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
          if (!NATIVE.test(m[2]!)) continue;
          for (const part of m[1]!.split(',')) {
            const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
            if (n) names.add(n);
          }
        }
      }
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'engine'));
  if (fs.existsSync(path.join(root, 'App.tsx'))) {
    const src = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
    for (const m of src.matchAll(/import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      if (NATIVE.test(m[2]!)) for (const part of m[1]!.split(',')) {
        const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
        if (n) names.add(n);
      }
    }
  }
  return [...names];
}

export async function loadAppInNode(root: string): Promise<{ default: unknown }> {
  const stubPath = path.join(root, 'scripts/rn-node-stub.cjs');
  const names = importedNames(root);
  const r = await esbuild.build({
    entryPoints: [path.join(root, 'App.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.png': 'empty', '.jpg': 'empty', '.jpeg': 'empty', '.ttf': 'empty', '.otf': 'empty' },
    external: ['react', 'react/jsx-runtime', stubPath],
    plugins: [
      {
        name: 'native-stub',
        setup(b) {
          b.onResolve({ filter: NATIVE }, (a) => ({ path: a.path, namespace: 'native-stub' }));
          b.onLoad({ filter: /.*/, namespace: 'native-stub' }, () => ({
            contents: `module.exports = require(${JSON.stringify(stubPath)}).moduleWith(${JSON.stringify(names)});`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const code = r.outputFiles[0]!.text;
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const req = (id: string) => (id === stubPath ? require(stubPath) : require(require.resolve(id, { paths: [root] })));
  new Function('module', 'exports', 'require', '__dirname', '__filename', code)(
    mod,
    mod.exports,
    req,
    root,
    path.join(root, 'App.tsx'),
  );
  return mod.exports as { default: unknown };
}
