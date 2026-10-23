import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import achievements from '../../content/willy/data/achievements.json';
import classes from '../../rulesets/willy/data/classes.json';
import companions from '../../rulesets/willy/data/companions.json';
import items from '../../content/willy/data/items.json';
import monsters from '../../rulesets/willy/data/monster-abilities.json';
import { generateRival, legendaryEntity, rivalEntity } from '../../content/willy/gen/rivals';
import legendaries from '../../content/willy/data/rivals.json';
import { narrate } from '../../content/willy/narrator';
import type { GameEvent, GameState } from '../../engine';

/**
 * What the player reads: no leftover {variables}, no markdown, no double spaces, and every
 * variable a Narrador line asks for is one its event can actually give (a line asking for one
 * that is never filled is skipped forever, which looks like a missing line, not an error).
 */

const root = join(import.meta.dirname, '..', '..', 'content', 'willy');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as unknown;

function strings(x: unknown, out: string[] = [], key = ''): string[] {
  if (typeof x === 'string') {
    if (!['$comment', 'comentario', 'comment', 'nota'].includes(key)) out.push(x);
  } else if (Array.isArray(x)) x.forEach((v) => strings(v, out, key));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) strings(v, out, k);
  return out;
}

/** Files whose texts are shown as written (no templating at all). */
const STATIC: Record<string, unknown> = {
  classes,
  companions,
  items,
  monsters,
  glossary: read('texts/glossary.json'),
  'como-se-juega': read('texts/como-se-juega.json'),
  tutorial: read('tutorial.json'),
};

describe('Willy texts', () => {
  for (const [name, data] of Object.entries(STATIC)) {
    it(`${name}: no {variables}, markdown or double spaces`, () => {
      for (const s of strings(data)) {
        expect(s, s).not.toMatch(/[{}]/);
        expect(s, s).not.toMatch(/\*[^*\s][^*]*\*/);
        expect(s, s).not.toMatch(/ {2}|\s$|^\s/);
      }
    });
  }

  it('the UI texts only use the variables the client fills', () => {
    const ok = new Set(['valor', 'tramo', 'min', 'minimo', 'hito', 'caja', 'lista', 'texto', 'premio', 'multa', 'hecho', 'total', 'max', 'cumplidos', 'rotos', 'n', 'delta', 'patrocinador', 'regalo', 'presentador', 'opciones', 'color', 'respuesta']);
    for (const s of strings(read('texts/show.json'))) for (const m of s.matchAll(/\{(\w+)\}/g)) expect(ok.has(m[1]!), `${m[1]} in ${s}`).toBe(true);
  });
});

const BANKS = ['combate', 'logros-y-cajas', 'miscelanea', 'plantas'].flatMap((f) => (read(`narrator/${f}.json`) as { bancos: { id: string; evento: string; lineas: { id: string; texto: string }[] }[] }).bancos);

/** Variables the Narrador's context can fill (content/willy/narrator.ts → context). */
const KNOWN = new Set(['enemigo', 'objeto', 'rival', 'rivalNombre', 'rivalApodo', 'rivalApellido', 'rivalLugar', 'rivalOficio', 'rivalRaza', 'rivalMania', 'reloj', 'planta', 'logro', 'caja', 'cantidad', 'clase', 'dano', 'espectadores', 'fichas', 'nivel', 'nombre', 'patrocinador', 'probabilidad', 'vida', 'presentador', 'presentadorCorto', 'presentadorApodo', 'habilidad']);

describe('Willy narrator banks', () => {
  it('every line has unique ids and only asks for variables the Narrador knows', () => {
    const ids = new Set<string>();
    for (const b of BANKS) {
      for (const l of b.lineas) {
        expect(ids.has(`${b.id}/${l.id}`), `${b.id}/${l.id} repeated`).toBe(false);
        ids.add(`${b.id}/${l.id}`);
        expect(l.texto, l.id).not.toMatch(/ {2}|\*[^*\s][^*]*\*/);
        for (const m of l.texto.matchAll(/\{(\w+)((?::\w+)*)\}/g)) {
          expect(KNOWN.has(m[1]!), `${l.id}: {${m[1]}}`).toBe(true);
          for (const f of m[2]!.split(':').filter(Boolean)) expect(['Mayus', 'o', 'el', 'un', 'del', 'al']).toContain(f);
        }
        const open = (l.texto.match(/\{/g) ?? []).length;
        const closed = (l.texto.match(/\}/g) ?? []).length;
        expect(open, `${l.id}: unbalanced braces`).toBe(closed);
      }
    }
  });

  it('every bank listens to an event something emits (or is on the known-pending list)', () => {
    // Client-side moments nothing emits yet: idle for a while, opening the bag, saving.
    const pending = new Set(['playerIdle', 'inventoryOpened', 'gameSaved']);
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const source = [...files(join(root, '..', '..', 'rulesets', 'willy')), ...files(join(root, '..', '..', 'engine')), ...files(root)].map((f) => readFileSync(f, 'utf8')).join('\n');
    // Banks keyed on an event a bank-side view synthesises (multiKill, attackResolved...) count too.
    const synthesised = new Set(['multiKill', 'attackResolved', 'combatEnded']);
    for (const b of BANKS) {
      if (pending.has(b.evento) || synthesised.has(b.evento)) continue;
      expect(source.includes(`'${b.evento}'`) || source.includes(`type: '${b.evento}'`), `${b.id}: nothing emits ${b.evento}`).toBe(true);
    }
  });
});

describe('Willy achievements', () => {
  it('their lines only use variables an unlock carries', () => {
    const ok = new Set(['enemigo', 'objeto', 'habilidad', 'patrocinador', 'presentador', 'presentadorCorto', 'presentadorApodo', 'rival', 'rivalNombre', 'rivalApodo', 'rivalRaza', 'rivalLugar', 'rivalOficio']);
    for (const l of achievements.logros as { id: string; nombre: string; descripcion: string; narrador?: string }[]) {
      for (const s of [l.nombre, l.descripcion]) expect(s, `${l.id}`).not.toMatch(/[{}]/);
      for (const m of (l.narrador ?? '').matchAll(/\{(\w+)((?::\w+)*)\}/g)) expect(ok.has(m[1]!), `${l.id}: {${m[1]}}`).toBe(true);
      expect(l.narrador ?? '', l.id).not.toMatch(/\*[^*\s][^*]*\*/);
    }
  });
});

describe('Willy rivals: lines resolved when the rival is made', () => {
  const state = { entities: {} } as unknown as GameState;
  it('the Narrador speaks every rival event with its fields filled', () => {
    const e = rivalEntity(generateRival(4, 3, 1), 3, { x: 0, y: 0 });
    const tag = (p: string) => e.tags.find((t) => t.startsWith(`${p}:`))!.slice(p.length + 1);
    const base = { type: 'rivalEncountered', rival: e.id, rivalNombre: tag('rnombre'), rivalApodo: tag('rapodo'), rivalApellido: tag('rapellido'), rivalLugar: tag('rlugar'), rivalOficio: tag('roficio'), rivalRaza: tag('rraza'), rivalMania: tag('rmania'), rivalGenero: tag('genero'), rivalRazaId: tag('raza'), comportamiento: tag('comportamiento'), legendario: false };
    for (const extra of [{ momento: 'presentacion', primeraVez: true }, { momento: 'pacto' }, { momento: 'huida' }, { momento: 'derrota' }, { momento: 'pacto', comoAliado: true }, { momento: 'traicion', traicion: true }]) {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const line = narrate({ ...base, ...extra } as unknown as GameEvent, state);
        if (line) seen.add(line);
      }
      expect(seen.size, JSON.stringify(extra)).toBeGreaterThan(0);
      for (const l of seen) expect(l).not.toMatch(/[{}]/);
    }
  });

  it('every legendary opens with its own line', () => {
    for (const l of legendaries.legendarios) {
      const e = legendaryEntity(l, 1, { x: 0, y: 0 });
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const line = narrate({ type: 'rivalEncountered', momento: 'presentacion', primeraVez: true, legendario: true, rival: e.id, rivalNombre: l.nombre, rivalGenero: l.genero } as unknown as GameEvent, state);
        if (line) seen.add(line);
      }
      expect([...seen].some((x) => x.length > 20), l.id).toBe(true);
    }
  });
});
