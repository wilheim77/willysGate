import { type EntitySheet, type GameState, type SheetSection, hasTag } from '../../engine';
import { ATTRS, ATTR_LABELS, abilityUses, attr, baseMovement, classOf, defence, level, skillLevel, tierLabel } from './character';
import { BASIC_SKILLS, CLASSES, SKILL_THRESHOLDS, WILLY } from './data';

/** Willy's character sheet: big visible numbers, skills with their level and uses. */
export function describeEntity(state: GameState, id: string, labels: { conditions: Record<string, { label: string; description?: string }> }): EntitySheet {
  const e = state.entities[id]!;
  const sections: SheetSection[] = [];
  const cls = CLASSES[classOf(e) ?? ''];
  const isCreature = hasTag(e, 'criatura');
  const subtitle = cls ? `Humano de Castro · ${cls.nombre} · nivel ${level(e)}` : undefined;

  if (!isCreature) {
    sections.push({ title: 'Atributos', rows: ATTRS.map((a) => ({ label: ATTR_LABELS[a], value: String(attr(e, a)), term: `attr:${a}` })) });
  }
  const vida = e.resources.vida;
  sections.push({
    title: 'Combate',
    rows: [
      ...(vida ? [{ label: 'Vida', value: `${vida.current}/${vida.max}`, term: 'vida' }] : []),
      ...(e.resources.energia ? [{ label: 'Energía', value: `${e.resources.energia.current}/${e.resources.energia.max}`, term: 'energia' }] : []),
      { label: 'Defensa', value: String(defence(e)), term: 'def' },
      { label: 'Movimiento', value: `${baseMovement(e)} casillas` },
    ],
  });
  if (cls) {
    const abilities = cls.habilidades.filter((h) => h.nivelPersonaje <= level(e));
    sections.push({
      title: 'Habilidades',
      items: [...abilities, ...BASIC_SKILLS].map((h) => {
        const lvl = skillLevel(e, h.id);
        const progress = `\n${tierLabel(e, h.id)}`;
        const byLevel = (h as { nombresPorNivel?: Record<string, string> }).nombresPorNivel?.[String(lvl)];
        const unused = (h as { textoSinEstrenar?: string }).textoSinEstrenar;
        const text = unused && !e.tags.includes(`estrenado:${h.id}`) && abilityUses(e, h.id) === 0 ? unused : h.texto;
        return { label: `${byLevel ?? h.nombre} (nv. ${lvl})`, text: `${text}${h.pasiva ? '' : progress}` };
      }),
    });
    sections.push({
      title: 'Rasgos',
      items: [...WILLY.ventajas, WILLY.desventaja, cls.desventaja].map((t) => ({ label: t.nombre, text: t.texto })),
    });
  }
  if (e.conditions.length) {
    sections.push({ title: 'Estados', items: e.conditions.map((c) => ({ label: labels.conditions[c.id]?.label ?? c.id, text: labels.conditions[c.id]?.description ?? '', term: c.id })) });
  }
  return subtitle ? { subtitle, sections } : { sections };
}
