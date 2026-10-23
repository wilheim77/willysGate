import type { GameEvent, GameState } from '../../engine';
import { CLASSES } from '../../rulesets/willy';

/**
 * On-screen announcements (GameDefinition.announce): an ability levelling up with use (big
 * for the Maestría), Willy levelling up and what it unlocks. The Narrador comments on top.
 */
export function announce(event: GameEvent, state: GameState): { text: string; big?: boolean } | null {
  const e = event as GameEvent & Record<string, unknown>;
  if (e.type === 'skillLevelUp') {
    const who = state.entities[String(e.entityId)];
    if (!who || !who.tags.includes('pc')) return null;
    const name = String(e.nombre ?? e.habilidad);
    if (e.maestria) return { text: `¡MAESTRÍA! ${name}`, big: true };
    return { text: `${name} sube a nivel ${e.nivel}` };
  }
  if (e.type === 'levelUp') {
    const who = state.entities[String(e.entityId)];
    if (!who) return null;
    const cls = CLASSES[who.tags.find((t) => t.startsWith('clase:'))?.slice(6) ?? ''];
    const unlocked = ((e.desbloquea as string[] | undefined) ?? []).map((id) => cls?.habilidades.find((h) => h.id === id)?.nombre ?? id);
    return { text: `¡${who.name} sube a nivel ${e.nivel}!${unlocked.length ? ` Nueva habilidad: ${unlocked.join(', ')}` : ''}`, big: unlocked.length > 0 };
  }
  // The collapse caught Willy: say why he's at the stairs, hurt and on the floor.
  if (e.type === 'roomCollapsing' && e.fase === 'caida' && e.willyDentro) {
    return { text: '¡Derrumbe! Producción te saca a rastras hasta la escalera: −30 % de vida y Tumbado. Levántate y baja.', big: true };
  }
  if (e.type === 'chestOpened') {
    const item = typeof e.nombre === 'string' ? e.nombre : '';
    const fichas = Number(e.fichas ?? 0);
    return { text: `Caja de botín: ${[item, fichas ? `${fichas} fichas` : ''].filter(Boolean).join(' y ') || 'vacía. Qué decepción'}` };
  }
  // Willy down mid-fight: the fight ends (companions.ts), and the defeat screen follows.
  if (e.type === 'willyFueraDeCombate') return { text: '¡Willy está fuera de combate! Corten. Tu compañero se retira con él.', big: true };
  if (e.type === 'clockExpired') return { text: '¡Se acabó el reloj! Las salas empiezan a caer, de la más lejana a la escalera.', big: true };
  return null;
}
