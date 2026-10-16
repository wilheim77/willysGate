// Builds every game under content/<id>/ into dist/<id>/ and writes a landing page at dist/index.html.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const games = readdirSync('content', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`content/${d.name}/game.ts`))
  .map((d) => ({ id: d.name, ...JSON.parse(readFileSync(`content/${d.name}/meta.json`, 'utf8')) }));

for (const game of games) {
  console.log(`\n== Building ${game.id} ==`);
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, GAME: game.id } });
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const items = games
  .map((g) => `<li><a href="./${g.id}/">${escape(g.title)}</a><p>${escape(g.tagline ?? '')}</p></li>`)
  .join('\n      ');

writeFileSync(
  'dist/index.html',
  `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>willysGate</title>
    <style>
      body { margin: 0; min-height: 100vh; background: #121014; color: #cfc6b4; font: 18px ui-monospace, monospace; padding: 32px 16px; box-sizing: border-box; }
      main { max-width: 640px; margin: 0 auto; }
      h1 { color: #a3412f; letter-spacing: 2px; }
      ul { list-style: none; padding: 0; }
      li { border: 2px solid #4a4449; padding: 12px 16px; margin-bottom: 12px; background: #1d1a1e; }
      a { color: #e0d6c2; font-size: 22px; }
      p { color: #8a8174; margin: 6px 0 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>willysGate</h1>
      <ul>
      ${items}
      </ul>
    </main>
  </body>
</html>
`,
);
console.log(`\nBuilt ${games.length} game(s): ${games.map((g) => g.id).join(', ')}`);
