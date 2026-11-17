/**
 * Production CSV Sanitization Utilities (CWE-1236 protection)
 */

export function sanitizeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) {
    return '""';
  }
  let str = String(val);
  // Neutralize CSV formula injection by prepending an apostrophe if it starts with formula control characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}
