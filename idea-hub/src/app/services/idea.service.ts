import { Injectable, signal, computed } from '@angular/core';
import {
  ProductIdea,
  IdeaStatus,
  IdeaCategory,
  UserRole,
  SortOption,
  Comment,
  InternalTeamNote,
  CustomerNotification,
  NotificationPreferences,
} from '../models/idea.model';

const STORAGE_IDEAS_KEY = 'ideahub_feedback_data_v3';
const STORAGE_NOTIFS_KEY = 'ideahub_notifs_data_v3';
const STORAGE_ROLE_KEY = 'ideahub_role_data_v3';
const STORAGE_PREFS_KEY = 'ideahub_prefs_data_v3';

export const CURRENT_CUSTOMER_EMAIL = 'customer@example.com';
export const CURRENT_CUSTOMER_NAME = 'Sarah Customer';

@Injectable({ providedIn: 'root' })
export class IdeaService {
  // 1. Perspective / Role
  readonly currentRole = signal<UserRole>(this._loadRole());

  // 2. State Stores
  private readonly _ideas = signal<ProductIdea[]>(this._loadIdeas());
  private readonly _notifications = signal<CustomerNotification[]>(this._loadNotifications());
  readonly notificationPreferences = signal<NotificationPreferences>(this._loadPreferences());

  // 3. Active Idea selected for detail modal & Submit Modal
  readonly selectedIdeaId = signal<string | null>(null);
  readonly isSubmitModalOpen = signal<boolean>(false);

  // 4. Filters & Search
  readonly statusFilter = signal<IdeaStatus | 'all'>('all');
  readonly categoryFilter = signal<IdeaCategory | 'all'>('all');
  readonly sortOption = signal<SortOption>('upvotes-desc');
  readonly searchQuery = signal<string>('');
  readonly showMerged = signal<boolean>(false);

  // 5. Computed Signals
  readonly selectedIdea = computed(() => {
    const id = this.selectedIdeaId();
    if (!id) return null;
    return this._ideas().find(i => i.id === id) || null;
  });

  readonly ideas = this._ideas.asReadonly();
  readonly notifications = this._notifications.asReadonly();
  readonly unreadNotificationsCount = computed(() => this._notifications().filter(n => !n.read).length);

  // Role permissions
  readonly isCustomer = computed(() => this.currentRole() === 'customer');
  readonly isTeamMember = computed(() => this.currentRole() === 'team' || this.currentRole() === 'admin');
  readonly isAdmin = computed(() => this.currentRole() === 'admin');

  // Counts
  readonly totalCount = computed(() => this._ideas().filter(i => i.status !== 'merged').length);
  readonly underReviewCount = computed(() => this._ideas().filter(i => i.status === 'under-review').length);
  readonly plannedCount = computed(() => this._ideas().filter(i => i.status === 'planned').length);
  readonly inProgressCount = computed(() => this._ideas().filter(i => i.status === 'in-progress').length);
  readonly completedCount = computed(() => this._ideas().filter(i => i.status === 'completed').length);
  readonly declinedCount = computed(() => this._ideas().filter(i => i.status === 'declined').length);
  readonly mergedCount = computed(() => this._ideas().filter(i => i.status === 'merged').length);

  detectDuplicates(query: string): ProductIdea[] {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 3) return [];
    const words = q.split(/\s+/).filter(w => w.length > 2);
    return this._ideas().filter(i => {
      const titleLower = i.title.toLowerCase();
      return words.some(w => titleLower.includes(w));
    });
  }

  // Filtered Ideas Feed
  readonly filteredIdeas = computed(() => {
    let list = this._ideas();

    const s = this.statusFilter();
    const q = this.searchQuery().trim().toLowerCase();

    if (s === 'all') {
      if (!this.showMerged() && !q) {
        list = list.filter(i => i.status !== 'merged');
      }
    } else {
      list = list.filter(i => i.status === s);
    }

    // Category Filter
    const c = this.categoryFilter();
    if (c !== 'all') {
      list = list.filter(i => i.category === c);
    }

    // Search Query
    if (q) {
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.authorName.toLowerCase().includes(q)
      );
    }

    // Sort
    const sort = this.sortOption();
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'upvotes-desc':
          return b.upvotes - a.upvotes;
        case 'date-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'comments-desc':
          return b.comments.length - a.comments.length;
        default:
          return 0;
      }
    });
  });

  // Switch Role
  setRole(role: UserRole): void {
    this.currentRole.set(role);
    try {
      localStorage.setItem(STORAGE_ROLE_KEY, role);
    } catch {}
  }

  // Duplicate detection helper for input title
  findDuplicates(title: string): ProductIdea[] {
    const trimmed = title.trim().toLowerCase();
    if (trimmed.length < 3) return [];
    return this._ideas().filter(
      i => i.status !== 'merged' && (i.title.toLowerCase().includes(trimmed) || trimmed.includes(i.title.toLowerCase()))
    );
  }

  // Submit Feedback / Idea
  submitIdea(params: { title: string; description: string; category: IdeaCategory; authorName: string; authorEmail: string }): ProductIdea {
    const authorEmail = params.authorEmail.trim() || CURRENT_CUSTOMER_EMAIL;
    const authorName = params.authorName.trim() || CURRENT_CUSTOMER_NAME;

    const newIdea: ProductIdea = {
      id: crypto.randomUUID(),
      title: params.title.trim(),
      description: params.description.trim(),
      category: params.category,
      status: 'under-review',
      authorName,
      authorEmail,
      upvotes: 1,
      upvotedByUser: true,
      subscribedUserEmails: [authorEmail],
      createdAt: new Date().toISOString(),
      comments: [],
      internalNotes: [],
      statusHistory: [
        {
          id: crypto.randomUUID(),
          previousStatus: 'under-review',
          newStatus: 'under-review',
          changedBy: 'System (Verified)',
          note: 'Submission verified and queued on the public board.',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    this._ideas.update(list => [newIdea, ...list]);
    this._saveIdeas();
    return newIdea;
  }

  // Toggle Upvote
  toggleUpvote(ideaId: string): void {
    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        const upvoted = !idea.upvotedByUser;
        const newSubs = upvoted
          ? Array.from(new Set([...idea.subscribedUserEmails, CURRENT_CUSTOMER_EMAIL]))
          : idea.subscribedUserEmails;

        return {
          ...idea,
          upvotedByUser: upvoted,
          upvotes: upvoted ? idea.upvotes + 1 : Math.max(0, idea.upvotes - 1),
          subscribedUserEmails: newSubs,
        };
      })
    );
    this._saveIdeas();
  }

  // Toggle Subscription
  toggleSubscription(ideaId: string): void {
    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        const isSub = idea.subscribedUserEmails.includes(CURRENT_CUSTOMER_EMAIL);
        const nextSubs = isSub
          ? idea.subscribedUserEmails.filter(e => e !== CURRENT_CUSTOMER_EMAIL)
          : [...idea.subscribedUserEmails, CURRENT_CUSTOMER_EMAIL];

        return {
          ...idea,
          subscribedUserEmails: nextSubs,
        };
      })
    );
    this._saveIdeas();
  }

  isSubscribed(idea: ProductIdea): boolean {
    return idea.subscribedUserEmails.includes(CURRENT_CUSTOMER_EMAIL);
  }

  // Add Public Comment
  addPublicComment(ideaId: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) return;

    const role = this.currentRole();
    const isTeam = role === 'team' || role === 'admin';

    const comment: Comment = {
      id: crypto.randomUUID(),
      authorName: isTeam ? 'Product Team' : CURRENT_CUSTOMER_NAME,
      authorEmail: isTeam ? 'team@company.internal' : CURRENT_CUSTOMER_EMAIL,
      isTeamMember: isTeam,
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        return {
          ...idea,
          comments: [...idea.comments, comment],
        };
      })
    );
    this._saveIdeas();

    // Trigger notification if team replies to idea
    if (isTeam) {
      const target = this._ideas().find(i => i.id === ideaId);
      if (target) {
        this._createNotification({
          ideaId: target.id,
          ideaTitle: target.title,
          recipientEmail: target.authorEmail,
          status: target.status,
          message: `The product team replied to your feedback: "${trimmed.slice(0, 100)}${trimmed.length > 100 ? '...' : ''}"`,
        });
      }
    }
  }

  // Add Internal Note (Team & Admin only)
  addInternalNote(ideaId: string, content: string): void {
    if (!this.isTeamMember()) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const note: InternalTeamNote = {
      id: crypto.randomUUID(),
      authorName: this.isAdmin() ? 'David Park (Admin)' : 'Mike Chen (Team)',
      authorEmail: 'team@internal.corp',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        return {
          ...idea,
          internalNotes: [...(idea.internalNotes || []), note],
        };
      })
    );
    this._saveIdeas();
  }

  // Update Status & Async Notification with Public Note
  updateStatus(ideaId: string, newStatus: IdeaStatus, publicNote: string): void {
    if (!this.isTeamMember()) return;

    let targetIdea: ProductIdea | undefined;

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;

        const historyItem = {
          id: crypto.randomUUID(),
          previousStatus: idea.status,
          newStatus,
          changedBy: this.isAdmin() ? 'David Park (Admin)' : 'Sarah Johnson (Team)',
          note: publicNote.trim() || `Status updated to ${this.formatStatusLabel(newStatus)}.`,
          timestamp: new Date().toISOString(),
        };

        const updated = {
          ...idea,
          status: newStatus,
          statusHistory: [historyItem, ...idea.statusHistory],
        };
        targetIdea = updated;
        return updated;
      })
    );
    this._saveIdeas();

    if (targetIdea) {
      this._dispatchAsyncNotifications(targetIdea, newStatus, publicNote.trim());
    }
  }

  // Merge Duplicate Feedback
  mergeIdeas(sourceIdeaId: string, targetIdeaId: string, mergeNote?: string): void {
    if (!this.isTeamMember()) return;
    if (sourceIdeaId === targetIdeaId) return;

    const source = this._ideas().find(i => i.id === sourceIdeaId);
    const target = this._ideas().find(i => i.id === targetIdeaId);
    if (!source || !target) return;

    const noteText = mergeNote?.trim() || `Marked as duplicate and merged into "${target.title}".`;

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id === sourceIdeaId) {
          return {
            ...idea,
            status: 'merged' as IdeaStatus,
            mergedIntoId: target.id,
            mergedIntoTitle: target.title,
            statusHistory: [
              {
                id: crypto.randomUUID(),
                previousStatus: idea.status,
                newStatus: 'merged' as IdeaStatus,
                changedBy: 'Sarah Johnson (Merge Engine)',
                note: noteText,
                timestamp: new Date().toISOString(),
              },
              ...idea.statusHistory,
            ],
          };
        }

        if (idea.id === targetIdeaId) {
          const combinedSubs = Array.from(new Set([...idea.subscribedUserEmails, ...source.subscribedUserEmails]));
          return {
            ...idea,
            upvotes: idea.upvotes + source.upvotes,
            subscribedUserEmails: combinedSubs,
            statusHistory: [
              {
                id: crypto.randomUUID(),
                previousStatus: idea.status,
                newStatus: idea.status,
                changedBy: 'Sarah Johnson (Merge Engine)',
                note: `Consolidated ${source.upvotes} upvotes from duplicate: "${source.title}".`,
                timestamp: new Date().toISOString(),
              },
              ...idea.statusHistory,
            ],
          };
        }

        return idea;
      })
    );
    this._saveIdeas();

    this._createNotification({
      ideaId: target.id,
      ideaTitle: target.title,
      recipientEmail: source.authorEmail,
      status: 'merged',
      message: `Your feedback "${source.title}" was merged into "${target.title}". All upvotes have been consolidated into the canonical idea.`,
    });
  }

  // Delete Idea (Admin only)
  deleteIdea(ideaId: string): void {
    if (!this.isAdmin()) return;
    this._ideas.update(list => list.filter(i => i.id !== ideaId));
    if (this.selectedIdeaId() === ideaId) {
      this.selectedIdeaId.set(null);
    }
    this._saveIdeas();
  }

  // Export to CSV (Section 8 of SPEC.MD)
  exportToCsv(): void {
    const list = this._ideas();
    const headers = ['Title', 'Category', 'Status', 'Vote Count', 'Submission Date', 'Submitter Display Name', 'Submitter Email'];
    
    const rows = list.map(i => [
      `"${i.title.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      `"${this.formatStatusLabel(i.status)}"`,
      i.upvotes,
      `"${i.createdAt}"`,
      `"${i.authorName.replace(/"/g, '""')}"`,
      `"${i.authorEmail.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `feedback_dashboard_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  markNotificationRead(notificationId: string): void {
    this._notifications.update(notifs =>
      notifs.map(n => (n.id === notificationId ? { ...n, read: true } : n))
    );
    this._saveNotifications();
  }

  markAllNotificationsRead(): void {
    this._notifications.update(notifs => notifs.map(n => ({ ...n, read: true })));
    this._saveNotifications();
  }

  togglePreference(key: keyof NotificationPreferences): void {
    this.notificationPreferences.update(p => {
      const updated = { ...p, [key]: !p[key] };
      try {
        localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  formatStatusLabel(status: IdeaStatus): string {
    switch (status) {
      case 'under-review': return 'Under Review';
      case 'planned': return 'Planned';
      case 'in-progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'declined': return 'Declined';
      case 'merged': return 'Merged';
    }
  }

  // Async non-blocking notification dispatch
  private _dispatchAsyncNotifications(idea: ProductIdea, status: IdeaStatus, publicNote: string): void {
    setTimeout(() => {
      if (!this.notificationPreferences().inAppAlerts) return;

      const noteText = publicNote || `Status updated to ${this.formatStatusLabel(status)}.`;
      idea.subscribedUserEmails.forEach(email => {
        this._createNotification({
          ideaId: idea.id,
          ideaTitle: idea.title,
          recipientEmail: email,
          status,
          message: `Update on "${idea.title}": ${noteText}`,
        });
      });
    }, 150);
  }

  private _createNotification(params: { ideaId: string; ideaTitle: string; recipientEmail: string; status: IdeaStatus; message: string }): void {
    const notif: CustomerNotification = {
      id: crypto.randomUUID(),
      ideaId: params.ideaId,
      ideaTitle: params.ideaTitle,
      recipientEmail: params.recipientEmail,
      message: params.message,
      status: params.status,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this._notifications.update(list => [notif, ...list]);
    this._saveNotifications();
  }

  private _saveIdeas(): void {
    try {
      localStorage.setItem(STORAGE_IDEAS_KEY, JSON.stringify(this._ideas()));
    } catch {}
  }

  private _saveNotifications(): void {
    try {
      localStorage.setItem(STORAGE_NOTIFS_KEY, JSON.stringify(this._notifications()));
    } catch {}
  }

  private _loadRole(): UserRole {
    try {
      const r = localStorage.getItem(STORAGE_ROLE_KEY) as UserRole;
      if (r === 'team' || r === 'customer' || r === 'admin') return r;
    } catch {}
    return 'customer';
  }

  private _loadPreferences(): NotificationPreferences {
    try {
      const raw = localStorage.getItem(STORAGE_PREFS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      emailUpdates: true,
      inAppAlerts: true,
    };
  }

  private _loadNotifications(): CustomerNotification[] {
    try {
      const raw = localStorage.getItem(STORAGE_NOTIFS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}

    return [
      {
        id: 'notif-1',
        ideaId: 'sketch-3',
        ideaTitle: 'Bug in Checkout Process',
        recipientEmail: CURRENT_CUSTOMER_EMAIL,
        message: 'Your feedback "Bug in Checkout Process" is now In Progress! Our team is reviewing the payment gateway logs.',
        status: 'in-progress',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        read: false,
      },
    ];
  }

  // Exact seed items from Sarah Johnson's Dashboard Sketch!
  private _loadIdeas(): ProductIdea[] {
    try {
      const raw = localStorage.getItem(STORAGE_IDEAS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}

    return [
      // 1. Sketch Item: 35 Votes | New Feature Request - Request to add a new feature. [Under Review]
      {
        id: 'sketch-1',
        title: 'New Feature Request',
        description: 'Request to add a new feature.',
        category: 'Core Feature',
        status: 'under-review',
        authorName: 'Sarah Customer',
        authorEmail: 'sarah.c@external.com',
        upvotes: 35,
        upvotedByUser: true,
        subscribedUserEmails: ['sarah.c@external.com', CURRENT_CUSTOMER_EMAIL],
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        comments: [
          {
            id: 'c-1',
            authorName: 'Sarah Customer',
            authorEmail: 'sarah.c@external.com',
            isTeamMember: false,
            content: 'Could we also make sure this supports multiple workspaces?',
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: 'c-2',
            authorName: 'Product Team',
            authorEmail: 'team@company.internal',
            isTeamMember: true,
            content: 'Great feedback! We are currently evaluating this for the upcoming quarterly planning cycle.',
            createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
        ],
        internalNotes: [
          {
            id: 'n-1',
            authorName: 'Mike Chen (Team)',
            authorEmail: 'mike@internal.corp',
            content: 'Sarah Johnson and David Park discussed in email: high potential ROI, aligns with Q3 OKRs.',
            createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
        ],
        statusHistory: [
          {
            id: 'h-1',
            previousStatus: 'under-review',
            newStatus: 'under-review',
            changedBy: 'System',
            note: 'Submission verified via email and published to the public board.',
            timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
          },
        ],
      },

      // 2. Sketch Item: 20 Votes | Improve Search Function - Enhance the search options. [Planned]
      {
        id: 'sketch-2',
        title: 'Improve Search Function',
        description: 'Enhance the search options.',
        category: 'Performance',
        status: 'planned',
        authorName: 'Alex Customer',
        authorEmail: CURRENT_CUSTOMER_EMAIL,
        upvotes: 20,
        upvotedByUser: false,
        subscribedUserEmails: [CURRENT_CUSTOMER_EMAIL],
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
        comments: [],
        internalNotes: [
          {
            id: 'n-2',
            authorName: 'David Park (Admin)',
            authorEmail: 'david@internal.corp',
            content: 'Adding fuzzy matching and Postgres full-text indexing.',
            createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
          },
        ],
        statusHistory: [
          {
            id: 'h-2',
            previousStatus: 'under-review',
            newStatus: 'planned',
            changedBy: 'Sarah Johnson (Team)',
            note: 'Approved for development backlog. Search improvements are planned for next release.',
            timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
          },
        ],
      },

      // 3. Sketch Item: 15 Votes | Bug in Checkout Process - Issue with payment steps. [In Progress]
      {
        id: 'sketch-3',
        title: 'Bug in Checkout Process',
        description: 'Issue with payment steps.',
        category: 'Core Feature',
        status: 'in-progress',
        authorName: 'E-commerce User',
        authorEmail: 'buyer@shop.io',
        upvotes: 15,
        upvotedByUser: true,
        subscribedUserEmails: ['buyer@shop.io', CURRENT_CUSTOMER_EMAIL],
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        comments: [],
        internalNotes: [
          {
            id: 'n-3',
            authorName: 'Mike Chen (Team)',
            authorEmail: 'mike@internal.corp',
            content: 'Reproduced bug in payment tokenization step when Safari 3D Secure redirects.',
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        ],
        statusHistory: [
          {
            id: 'h-3',
            previousStatus: 'planned',
            newStatus: 'in-progress',
            changedBy: 'Sarah Johnson (Team)',
            note: 'Investigating payment steps issue with highest priority.',
            timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        ],
      },

      // 4. Sketch Item: 42 Votes | Add Dark Mode - Option for dark theme. [Completed]
      {
        id: 'sketch-4',
        title: 'Add Dark Mode',
        description: 'Option for dark theme.',
        category: 'UI / UX',
        status: 'completed',
        authorName: 'Community Dev',
        authorEmail: 'nightowl@coder.com',
        upvotes: 42,
        upvotedByUser: false,
        subscribedUserEmails: ['nightowl@coder.com', 'mobile@test.com'],
        createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
        comments: [],
        internalNotes: [],
        statusHistory: [
          {
            id: 'h-4',
            previousStatus: 'in-progress',
            newStatus: 'completed',
            changedBy: 'David Park (Admin)',
            note: 'Shipped! Toggle dark mode anytime using the moon/sun button in the top header.',
            timestamp: new Date(Date.now() - 86400000 * 1).toISOString(),
          },
        ],
      },

      // 5. Merged Duplicate example: Night theme merged into Add Dark Mode
      {
        id: 'sketch-5',
        title: 'Night theme for evening reading',
        description: 'Please add a dark background for nighttime use.',
        category: 'UI / UX',
        status: 'merged',
        authorName: 'Mobile User',
        authorEmail: 'mobile@test.com',
        upvotes: 12,
        upvotedByUser: false,
        subscribedUserEmails: ['mobile@test.com'],
        mergedIntoId: 'sketch-4',
        mergedIntoTitle: 'Add Dark Mode',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        comments: [],
        internalNotes: [],
        statusHistory: [
          {
            id: 'h-5',
            previousStatus: 'under-review',
            newStatus: 'merged',
            changedBy: 'Sarah Johnson (Merge Engine)',
            note: 'Duplicate of Add Dark Mode. 12 votes consolidated into canonical idea.',
            timestamp: new Date(Date.now() - 86400000 * 8).toISOString(),
          },
        ],
      },
    ];
  }
}
