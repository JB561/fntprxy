#!/usr/bin/env node
/*
 * Exports the website as plain static files, so it can be hosted on GitHub Pages (or any static host).
 *
 *   node scripts/export-static.mjs [--out site] [--base /my-repo/] [--no-restore]
 *
 *   --out         Folder to write the site to (default: site). Keep it outside views/.
 *   --base        URL path the site will be served from. A GitHub Pages project site lives under
 *                 /<repo>/ (default: taken from GITHUB_REPOSITORY, or "/" for <user>.github.io repos).
 *   --no-restore  Skip the final normal rebuild of views/dist (the workflow uses this; it's only
 *                 there so a local run leaves your usual dev build exactly as it was).
 *
 * You get every page and route of the site (home, docs, FAQ, games, ... plus the links that point
 * to other websites). You do NOT get anything that needs the Node server: the proxy itself
 * (Ultraviolet / Scramjet + Wisp), the games API and the passcode gate. Those need a real server,
 * see the README ("Deploy InvisiProxy").
 *
 * config.json is never left modified: it is patched for the export and restored afterwards.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : fallback;
};

if (flag('--help') || flag('-h')) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(2, 20)
      .map((line) => line.replace(/^ ?\* ?/, ''))
      .join('\n')
  );
  process.exit(0);
}

const outDir = resolve(root, option('--out', 'site'));
if (outDir === root || outDir.startsWith(join(root, 'views') + '/')) {
  throw new Error('--out must be a folder outside views/ (and not the repo root).');
}

const defaultBase = () => {
  const repo = (process.env.GITHUB_REPOSITORY || '').split('/')[1];
  return !repo || repo.toLowerCase().endsWith('.github.io') ? '/' : `/${repo}/`;
};
const cleanBase = option('--base', defaultBase()).replace(/^\/+|\/+$/g, '');
const base = cleanBase ? `/${cleanBase}/` : '/';

const configPath = join(root, 'config.json');
const originalConfig = readFileSync(configPath, 'utf8');
const runBuild = () =>
  execFileSync(process.execPath, ['run-command.mjs', 'build'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : [join(dir, entry.name)]
  );

console.log(`Exporting the site for "${base}" into ${outDir}`);

let routes;
try {
  // Static hosts can't unpack the "disguised" (gzipped) pages, so build plain HTML under the right base path.
  writeFileSync(
    configPath,
    JSON.stringify(
      { ...JSON.parse(originalConfig), pathname: base, disguiseFiles: false },
      null,
      2
    ) + '\n'
  );
  runBuild();
  // routes.mjs reads config.json when it is imported, so import it only now.
  routes = await import(pathToFileURL(join(root, 'src/routes.mjs')).href);
  rmSync(outDir, { recursive: true, force: true });
  cpSync(join(root, 'views/dist'), outDir, { recursive: true });
} finally {
  writeFileSync(configPath, originalConfig);
}

const magic = readFileSync(join(outDir, 'index.html')).subarray(0, 2);
if (magic[0] === 0x1f && magic[1] === 0x8b)
  throw new Error('index.html is still gzipped: the static config was not applied.');

const { pages, externalPages } = routes;
const written = [];
const write = (relativePath, content) => {
  const file = join(outDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(relativePath);
};

// 1) Pretty routes (/browsing, /games, /documentation, ...) -> a real <route>.html file next to index.html.
for (const [route, file] of Object.entries(pages)) {
  if (route === 'default' || route === 'login') continue;
  if (typeof file !== 'string' || !file.endsWith('.html')) continue;
  const source = join(outDir, file);
  if (!existsSync(source)) {
    console.warn(`  skipped /${route}: ${file} not found`);
    continue;
  }
  if (join(outDir, `${route}.html`) === source) continue; // already in the right place (e.g. index)
  write(`${route}.html`, readFileSync(source));
}
// GitHub Pages shows 404.html for unknown addresses.
write('404.html', readFileSync(join(outDir, pages['test-404'])));

// 2) Links that point to other websites (/github, /patreon, ...) -> small redirect pages.
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const redirectPage = (url) =>
  `<!doctype html>\n<meta charset="utf-8">\n<title>Redirecting...</title>\n` +
  `<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}">\n` +
  `<link rel="canonical" href="${escapeHtml(url)}">\n` +
  `<script>location.replace(${JSON.stringify(url)});</script>\n` +
  `<p>Redirecting to <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>...</p>\n`;
for (const [route, target] of Object.entries(externalPages)) {
  if (typeof target === 'string') {
    write(`${route}.html`, redirectPage(target));
  } else if (target && typeof target === 'object') {
    for (const [key, url] of Object.entries(target)) {
      if (typeof url !== 'string') continue;
      write(key === 'default' ? `${route}/index.html` : `${route}/${key}.html`, redirectPage(url));
    }
  }
}

// 3) A few links in the page templates are written as "/" and "/games" (no base path). Fix them up.
let fixedFiles = 0;
if (base !== '/') {
  const escapedBare = base.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootLink = new RegExp(`(\\b(?:href|src|action)=["']?)/(?!/|${escapedBare})`, 'g');
  for (const file of walk(outDir).filter((f) => f.endsWith('.html'))) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(rootLink, `$1${base}`);
    if (after !== before) {
      writeFileSync(file, after);
      fixedFiles++;
    }
  }
}

write('.nojekyll', '');

console.log(
  `Done: ${walk(outDir).length} files in ${outDir}\n` +
    `  ${written.length} route/redirect files generated, ${fixedFiles} pages had root links rewritten to ${base}`
);

if (!flag('--no-restore')) {
  runBuild(); // put views/dist back to the normal build for local development
  console.log('Restored the normal views/dist build.');
}
