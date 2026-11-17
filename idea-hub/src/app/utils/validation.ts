/**
 * Production Validation Utilities
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function countCharacters(str: string): number {
  if (!str) return 0;
  // Unicode code-point aware character counting (supports CJK, accents, and emojis)
  return Array.from(str).length;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateIdeaSubmission(
  title: string,
  description: string,
  authorEmail: string
): ValidationResult {
  const trimmedTitle = (title || '').trim();
  const titleLen = countCharacters(trimmedTitle);
  if (titleLen < 3) {
    return { valid: false, error: 'Title must be at least 3 characters long.' };
  }
  if (titleLen > 120) {
    return { valid: false, error: `Title cannot exceed 120 characters (current: ${titleLen}).` };
  }

  const trimmedDesc = (description || '').trim();
  const descLen = countCharacters(trimmedDesc);
  if (descLen < 5) {
    return { valid: false, error: 'Description must be at least 5 characters long.' };
  }
  if (descLen > 2000) {
    return { valid: false, error: `Description cannot exceed 2000 characters (current: ${descLen}).` };
  }

  const trimmedEmail = (authorEmail || '').trim();
  if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
    return { valid: false, error: 'A valid email address with a 2+ letter domain is required (e.g. name@domain.com).' };
  }

  return { valid: true };
}
