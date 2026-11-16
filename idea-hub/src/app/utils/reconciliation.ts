/**
 * Production Reconciliation Utilities
 */

export interface PendingItem {
  tempId: string;
  [key: string]: any;
}

export function reconcilePendingSubmissions<T extends { id: string }>(
  backendItems: T[],
  pendingMap: Map<string, any>
): void {
  for (const item of backendItems) {
    if (pendingMap.has(item.id)) {
      pendingMap.delete(item.id);
    }
  }
}

export interface NotificationRecord {
  id: string;
  ideaId: string;
  ideaTitle: string;
  recipientEmail: string;
  message: string;
  status: string;
  createdAt: string;
  read: boolean;
}

export function reconcileNotifications(
  serverRecords: Array<{
    id: string;
    ideaId: string;
    eventType?: string;
    title?: string;
    message: string;
    status: string;
    createdAt: string;
  }>,
  currentLocalRecords: NotificationRecord[],
  readIdSet: Set<string>
): NotificationRecord[] {
  const result: NotificationRecord[] = [];
  const seenCanonicalIds = new Set<string>();

  // Map existing read state by ID
  const localReadMap = new Map<string, boolean>();
  for (const local of currentLocalRecords) {
    if (local.read) {
      localReadMap.set(local.id, true);
    }
  }

  for (const s of serverRecords) {
    seenCanonicalIds.add(s.id);
    const isRead = readIdSet.has(s.id) || localReadMap.get(s.id) === true;
    result.push({
      id: s.id,
      ideaId: s.ideaId,
      ideaTitle: s.title || '',
      recipientEmail: 'customer@example.com',
      message: s.message,
      status: s.status,
      createdAt: s.createdAt,
      read: isRead
    });
  }

  // Preserve any local-only records that have not synced yet, without duplicating
  for (const local of currentLocalRecords) {
    if (!seenCanonicalIds.has(local.id)) {
      // Check if there's already a server record with the exact same event
      const isDuplicateOfServer = result.some(
        r => r.ideaId === local.ideaId && r.message === local.message
      );
      if (!isDuplicateOfServer) {
        result.push(local);
      }
    }
  }

  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
