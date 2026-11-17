/**
 * Production HTTP Headers Generator with Zero Credential Leakage
 */

export function buildAuthHeaders(
  role: string,
  adminApiKey?: string,
  voterKey: string = 'customer@example.com'
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Voter-Key': voterKey
  };

  if (role === 'team' || role === 'admin') {
    headers['X-User-Role'] = role;
    if (adminApiKey && adminApiKey.trim()) {
      headers['X-Admin-Key'] = adminApiKey.trim();
    }
  }

  return headers;
}
