export function splitBottomNavItems<T>(items: ReadonlyArray<T>): [ReadonlyArray<T>, ReadonlyArray<T>] {
  return [items.slice(0, 2), items.slice(items.length === 5 ? 3 : 2)];
}
