import navigation from './generatedComponentNavigation.json';
import { componentCatalog } from './componentCatalog';
import type { ComponentDefinition } from '../types';

export interface ComponentNavigationItem {
  path: string;
  name: string;
  englishName: string;
  category: string;
  component?: ComponentDefinition;
}

const definitions = new Map(componentCatalog.map((definition) => [definition.type, definition]));
const hiddenPalettePaths = new Set(['space', 'col', 'popup', 'style', 'config-provider', 'overlay', 'form']);

// Keep the editor's legacy definitions available to existing documents, while the
// palette follows the public documentation apart from explicitly hidden entries.
export const componentNavigation = navigation.map((group) => ({
  title: group.title,
  items: group.items.filter((item) => !hiddenPalettePaths.has(item.path)).map((item): ComponentNavigationItem => {
    const englishName = item.title.match(/[A-Za-z][A-Za-z0-9]+$/)?.[0] || '';
    const name = englishName ? item.title.slice(0, -englishName.length).trim() : item.title;
    const definition = definitions.get(item.path);
    return {
      path: item.path,
      name,
      englishName,
      category: group.title,
      component: definition ? { ...definition, name, englishName, category: group.title } : undefined,
    };
  }),
}));

export const componentCategories = componentNavigation.map((group) => group.title);
export const componentNavigationItems = componentNavigation.flatMap((group) => group.items);
