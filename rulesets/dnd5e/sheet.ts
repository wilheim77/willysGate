import { type EntitySheet, type GameState, type SheetSection, hasTag, stat, tagValue } from '../../engine';
import { ABILITIES, ABILITY_LABELS, SKILLS } from './abilities';
import { DAMAGE_LABELS } from './actions';
import { armorClass, mod, monsterOf, profBonus, tagValues } from './character';
import { CLASSES, MONSTER_ACTIONS, MONSTERS, RACES, SPELLS, WEAPONS } from './data';

/** Features and racial traits in plain Spanish, for the character sheet. */
export const FEATURES: Record<string, { label: string; text: string }> = {
  action_surge: { label: 'Oleada de acción', text: 'Una vez por descanso corto, una acción más en tu turno.' },
  arcane_recovery: { label: 'Recuperación arcana', text: 'Una vez por descanso largo, en un descanso corto recuperas espacios de conjuro (niveles hasta la mitad de tu nivel).' },
  asi: { label: 'Mejora de característica', text: 'Has mejorado tus características al subir de nivel.' },
  blessed_healer: { label: 'Sanador bendito', text: 'Al curar a otros con un conjuro, tú también te curas.' },
  brave: { label: 'Valiente', text: 'Ventaja para resistir el miedo.' },
  channel_divinity: { label: 'Canalizar divinidad', text: 'Poder divino que se recarga con un descanso corto.' },
  cunning_action: { label: 'Acción astuta', text: 'Correr, retirarte o esconderte como acción adicional.' },
  darkvision: { label: 'Visión en la oscuridad', text: 'Ves en la penumbra como si hubiera luz.' },
  destroy_undead: { label: 'Destruir muertos vivientes', text: 'Expulsar muertos vivientes destruye a los más débiles.' },
  disciple_of_life: { label: 'Discípulo de la vida', text: 'Tus conjuros de curación curan más.' },
  dwarven_resilience: { label: 'Resistencia enana', text: 'Resistes el veneno y su daño.' },
  dwarven_toughness: { label: 'Dureza enana', text: '+1 punto de golpe por nivel.' },
  expertise: { label: 'Pericia', text: 'Doble de competencia en algunas habilidades.' },
  extra_attack: { label: 'Ataque extra', text: 'Dos ataques con la acción de Atacar.' },
  fast_hands: { label: 'Manos rápidas', text: 'Usar objetos como acción adicional.' },
  fey_ancestry: { label: 'Linaje feérico', text: 'Ventaja contra hechizos y no te pueden dormir con magia.' },
  fighting_style_defense: { label: 'Estilo de combate: Defensa', text: '+1 a la CA con armadura.' },
  improved_critical: { label: 'Crítico mejorado', text: 'Crítico con 19 o 20 en el dado.' },
  keen_senses: { label: 'Sentidos agudos', text: 'Competencia en Percepción.' },
  lucky: { label: 'Suertudo', text: 'Si sacas un 1 natural, repites la tirada.' },
  nimble: { label: 'Ágil', text: 'Puedes pasar por la casilla de criaturas más grandes.' },
  potent_cantrip: { label: 'Truco potente', text: 'Tus trucos hacen la mitad de daño aunque superen la salvación.' },
  preserve_life: { label: 'Preservar la vida', text: 'Canalizar divinidad: reparte curación entre los aliados cercanos.' },
  relentless_endurance: { label: 'Aguante incansable', text: 'Una vez por descanso largo, si caes a 0 te quedas a 1.' },
  savage_attacks: { label: 'Ataques salvajes', text: 'Un dado de daño más en los críticos cuerpo a cuerpo.' },
  sculpt_spells: { label: 'Esculpir conjuros', text: 'Tus conjuros de área no dañan a tus aliados.' },
  second_story_work: { label: 'Trepador', text: 'Trepas sin esfuerzo y saltas más lejos.' },
  second_wind: { label: 'Tomar aliento', text: 'Acción adicional: recuperas 1d10 + nivel puntos de golpe.' },
  sneak_attack: { label: 'Ataque furtivo', text: 'Daño extra una vez por turno con ventaja o con un aliado al lado del objetivo.' },
  turn_undead: { label: 'Expulsar muertos vivientes', text: 'Los muertos vivientes cercanos huyen acobardados.' },
  uncanny_dodge: { label: 'Esquiva asombrosa', text: 'Reacción: recibes la mitad del daño de un ataque.' },
};

/** Resources shown on the sheet (the per-turn economy and bookkeeping stay out). */
const SHOWN_RESOURCES = /^(spell_slot_\d|second_wind|action_surge|channel_divinity|relentless|use_.+|innate_.+|drained)$/;

/** Monster traits shown on the sheet (tags from the stat block). */
const MONSTER_TRAITS: Record<string, { label: string; text: string }> = {
  pack_tactics: { label: 'Tácticas de manada', text: 'Ventaja al atacar si un aliado está pegado al objetivo.' },
  brute: { label: 'Bruto', text: 'Sus armas cuerpo a cuerpo hacen un dado de daño más.' },
  brave: { label: 'Valiente', text: 'Ventaja en las salvaciones contra el miedo.' },
  dark_devotion: { label: 'Devoción oscura', text: 'Ventaja en las salvaciones contra el miedo y los hechizos.' },
  undead_fortitude: { label: 'Fortaleza de no muerto', text: 'Puede quedarse en pie con 1 PG si supera una salvación de Constitución.' },
  parry: { label: 'Parada', text: 'Con su reacción, suma a su CA contra un ataque cuerpo a cuerpo que lo alcanzaría.' },
  stench: { label: 'Hedor', text: 'Quien empieza su turno a su lado puede quedar envenenado (salvación de Constitución).' },
};

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

export function describeEntity(state: GameState, id: string, labels: { resources: Record<string, { label: string }>; conditions: Record<string, { label: string; description?: string }> }): EntitySheet {
  const e = state.entities[id]!;
  const sections: SheetSection[] = [];
  const classId = tagValue(e, 'class');
  const raceId = tagValue(e, 'race');
  const monsterId = tagValue(e, 'monster');
  const isObject = e.tags.includes('object');
  const level = stat(e, 'level', 1);

  let subtitle: string | undefined;
  if (classId) {
    const cls = CLASSES[classId];
    const sub = cls && level >= cls.subclass.level ? ` (${cls.subclass.label})` : '';
    subtitle = `${RACES[raceId ?? '']?.label ?? ''} · ${cls?.label ?? classId}${sub} · nivel ${level}`;
  } else if (monsterId) {
    subtitle = MONSTERS[monsterId]?.label;
  } else if (isObject) {
    subtitle = 'Objeto';
  }

  const hp = e.resources.hp;
  const combat: SheetSection = { title: 'Combate', rows: [] };
  if (hp) combat.rows!.push({ label: 'Puntos de golpe', value: `${hp.current}/${hp.max}` });
  combat.rows!.push({ label: 'CA', value: String(armorClass(e)), term: 'ac' });
  if (!isObject) {
    combat.rows!.push(
      { label: 'Movimiento', value: `${stat(e, 'speed', 6)} casillas` },
      { label: 'Iniciativa', value: signed(mod(e, 'dex')) },
      { label: 'Competencia', value: signed(profBonus(e)), term: 'proficiency' },
    );
  }
  sections.push(combat);

  if (e.conditions.length) {
    sections.push({
      title: 'Estados',
      items: e.conditions.map((c) => {
        const def = labels.conditions[c.id];
        const turns = c.remainingTurns ? ` (${c.remainingTurns} t.)` : '';
        return { label: `${def?.label ?? c.id}${turns}`, ...(def?.description ? { text: def.description } : {}) };
      }),
    });
  }
  if (isObject) {
    if (hasTag(e, 'explosive_oil')) sections.push({ title: 'Peligro', items: [{ label: 'Explosivo', text: 'Revienta con el primer golpe: fuego alrededor y aceite ardiendo.' }] });
    return { ...(subtitle ? { subtitle } : {}), sections };
  }

  sections.push({
    title: 'Características',
    rows: ABILITIES.map((a) => {
      const save = hasTag(e, `prof:save:${a}`) ? ' · salv.' : '';
      return { label: ABILITY_LABELS[a], value: `${stat(e, a, 10)} (${signed(mod(e, a))})${save}` };
    }),
  });

  const skills = Object.entries(SKILLS).filter(([s]) => hasTag(e, `prof:${s}`));
  if (skills.length) {
    sections.push({
      title: 'Habilidades',
      rows: skills.map(([s, skill]) => ({ label: skill.label, value: signed(mod(e, skill.ability) + profBonus(e) * (hasTag(e, `expert:${s}`) ? 2 : 1)) })),
    });
  }

  const resources = Object.entries(e.resources).filter(([r]) => SHOWN_RESOURCES.test(r));
  if (resources.length) {
    sections.push({
      title: 'Recursos',
      rows: resources.map(([r, v]) => ({ label: labels.resources[r]?.label ?? r, value: `${v.current}/${v.max}`, ...(r.startsWith('spell_slot') ? { term: 'spell_slot' } : {}) })),
    });
  }

  const weapons = tagValues(e, 'weapon').filter((w) => WEAPONS[w]);
  if (weapons.length) {
    sections.push({
      title: 'Armas',
      rows: weapons.map((w) => {
        const d = WEAPONS[w]!;
        return { label: d.label, value: `${d.damage} ${DAMAGE_LABELS[d.type] ?? d.type}${d.range > 1 ? ` · ${d.range} cas.` : ''}` };
      }),
    });
  }

  const spells = tagValues(e, 'spell').filter((s) => SPELLS[s]).sort((a, b) => SPELLS[a]!.level - SPELLS[b]!.level);
  if (spells.length) {
    sections.push({
      title: 'Conjuros',
      items: spells.map((s) => {
        const sp = SPELLS[s]!;
        return { label: `${sp.label} · ${sp.level === 0 ? 'truco' : `nivel ${sp.level}`}`, text: sp.text };
      }),
    });
  }

  // A monster's own powers, weapon riders and traits.
  const powers = [
    ...tagValues(e, 'action')
      .filter((a) => MONSTER_ACTIONS[a])
      .map((a) => ({ label: MONSTER_ACTIONS[a]!.label, text: MONSTER_ACTIONS[a]!.text })),
    ...Object.entries(monsterOf(e)?.riders ?? {}).map(([w, rider]) => ({
      label: `${WEAPONS[w]?.label ?? w}: ${rider.label}`,
      text: rider.save ? `Al impactar, salvación de ${ABILITY_LABELS[rider.save.ability]} CD ${rider.save.dc}.` : 'Al impactar.',
    })),
    ...Object.entries(MONSTER_TRAITS)
      .filter(([t]) => e.tags.some((x) => x === t || x.startsWith(`${t}:`)))
      .map(([, trait]) => trait),
  ];
  if (powers.length) sections.push({ title: 'Poderes', items: powers });

  const features = tagValues(e, 'feature').filter((f) => FEATURES[f] && f !== 'asi');
  if (features.length) sections.push({ title: 'Rasgos', items: features.map((f) => ({ label: FEATURES[f]!.label, text: FEATURES[f]!.text })) });

  const defences = (['resist', 'immune', 'vuln'] as const).flatMap((kind) =>
    tagValues(e, kind).map((t) => ({ label: { resist: 'Resistente a', immune: 'Inmune a', vuln: 'Vulnerable a' }[kind], value: DAMAGE_LABELS[t] ?? t, term: 'resistance' })),
  );
  if (defences.length) sections.push({ title: 'Defensas', rows: defences });

  return { ...(subtitle ? { subtitle } : {}), sections };
}
