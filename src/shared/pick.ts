/**
 * The images a session should draw: the chosen ones that are still in the folder, in folder order.
 * No choice (undefined or empty) means the whole folder.
 */
export function imagesToDraw(all: readonly string[], chosen: readonly string[] | undefined): string[] {
  if (!chosen || chosen.length === 0) return all.slice();
  const want = new Set(chosen);
  return all.filter((rel) => want.has(rel));
}
