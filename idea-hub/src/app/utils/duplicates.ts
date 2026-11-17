/**
 * Production Real-Time Duplicate Detection Algorithm
 */

export function detectDuplicates<T extends { id: string; title: string }>(
  query: string,
  ideas: T[]
): T[] {
  const q = (query || '').trim().toLowerCase();
  if (!q || q.length < 3) return [];

  const words = q.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];

  return ideas.filter(idea => {
    const titleLower = idea.title.toLowerCase();
    return words.some(w => titleLower.includes(w));
  });
}
