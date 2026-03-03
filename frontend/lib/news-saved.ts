/**
 * Save for later (bookmarks) — localStorage only.
 */

const KEY = "lv_news_saved";

export function getSavedArticleIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isSaved(articleId: string): boolean {
  return getSavedArticleIds().includes(articleId);
}

export function toggleSaved(articleId: string): string[] {
  const ids = getSavedArticleIds();
  const idx = ids.indexOf(articleId);
  const next = idx >= 0 ? ids.filter((_, i) => i !== idx) : [...ids, articleId];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota or disabled
  }
  return next;
}
