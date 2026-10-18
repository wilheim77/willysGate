import { type WillyContent, configureWillyContent } from '../../rulesets/willy';
import achievements from './data/achievements.json';
import items from './data/items.json';
import loot from './data/loot-tables.json';

/**
 * Hands the show's meta data (items, loot boxes and tables, achievements) to the Willy ruleset.
 * Imported by setup.ts, so the game and the tests run with the same rules.
 */
export const META_CONTENT: WillyContent = {
  items: items.items as unknown as WillyContent['items'],
  loot: loot as unknown as WillyContent['loot'],
  achievements: achievements.logros as unknown as WillyContent['achievements'],
  categories: achievements.categorias as Record<string, string>,
};

configureWillyContent(META_CONTENT);
