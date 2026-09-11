export type NodeOption = { name: string; kind: 'existing' | 'create' };

export function getNodeOptions(names: string[], query: string): NodeOption[] {
  const search = query.trim();
  const foldedSearch = search.toLowerCase();
  const uniqueNames = [...new Set(names.map(name => name.trim()).filter(Boolean))];

  const rank = (name: string, foldedName: string) => {
    if (name === search) return 0;
    if (foldedName === foldedSearch) return 1;
    if (foldedName.startsWith(foldedSearch)) return 2;
    return 3;
  };

  const options: NodeOption[] = uniqueNames
    .map(name => ({ name, foldedName: name.toLowerCase() }))
    .filter(({ foldedName }) => foldedName.includes(foldedSearch))
    .map(({ name, foldedName }) => ({ name, rank: rank(name, foldedName) }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en') || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name }) => ({ name, kind: 'existing' }));

  if (search && !uniqueNames.includes(search)) {
    options.push({ name: search, kind: 'create' });
  }

  return options;
}

// Scroll the list itself; Element.scrollIntoView also scrolls the page behind it.
export function optionScrollTop(scrollTop: number, listTop: number, listHeight: number, optionTop: number, optionHeight: number): number {
  if (listHeight <= 0) return scrollTop;
  if (optionTop < listTop || optionHeight > listHeight) return Math.max(0, scrollTop + optionTop - listTop);
  const overflow = optionTop + optionHeight - listTop - listHeight;
  return overflow > 0 ? scrollTop + overflow : scrollTop;
}
