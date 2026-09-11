export type NodeOption = { name: string; kind: 'existing' | 'create' };

export function getNodeOptions(names: string[], query: string): NodeOption[] {
  const search = query.trim();
  const foldedSearch = search.toLowerCase();
  const uniqueNames = [...new Set(names.map(name => name.trim()).filter(Boolean))];

  const rank = (name: string) => {
    if (name === search) return 0;
    const foldedName = name.toLowerCase();
    if (foldedName === foldedSearch) return 1;
    if (foldedName.startsWith(foldedSearch)) return 2;
    return 3;
  };

  const options: NodeOption[] = uniqueNames
    .filter(name => name.toLowerCase().includes(foldedSearch))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0))
    .map(name => ({ name, kind: 'existing' }));

  if (search && !uniqueNames.includes(search)) {
    options.push({ name: search, kind: 'create' });
  }

  return options;
}
