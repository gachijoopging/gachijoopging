export function splitBottomNavItems<T>(
  items: ReadonlyArray<T>,
): [ReadonlyArray<T>, T | undefined, ReadonlyArray<T>] {
  const actionItem = items.length === 5 ? items[2] : undefined;
  return [items.slice(0, 2), actionItem, items.slice(actionItem ? 3 : 2)];
}
