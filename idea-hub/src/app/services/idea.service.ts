import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
const STORAGE_PENDING_KEY = 'ideahub_pending_submissions_v1';

export const CURRENT_CUSTOMER_EMAIL = 'customer@example.com';
export const CURRENT_CUSTOMER_NAME = 'Sarah Customer';

interface PendingSubmission {
  tempId: string;
  title: string;
  description: string;
  category: IdeaCategory;
  authorName: string;
  authorEmail: string;
}

interface IdeaBackendDTO {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  authorName: string;
  authorEmail?: string;
  upvotes: number;
  mergedIntoId?: string;
  mergedIntoTitle?: string;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  internalCount?: number;
}

interface IdeaDetailBackendDTO extends IdeaBackendDTO {
  subscribers?: string[];
  comments: Array<{
    id: string;
    ideaId: string;
    authorName: string;
    authorEmail?: string;
    isTeamMember: boolean;
    isInternal: boolean;
    content: string;
    createdAt: string;
  }>;
  internalNotes?: Array<{
    id: string;
    ideaId: string;
    authorName: string;
    authorEmail?: string;
    isTeamMember: boolean;
    isInternal: boolean;
    content: string;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    ideaId: string;
    previousStatus: IdeaStatus;
    newStatus: IdeaStatus;
    changedBy: string;
    note?: string;
    timestamp: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class IdeaService {
  private readonly http = inject(HttpClient);
  private readonly API_BASE = 'http://localhost:8080/api';
  private readonly _pendingSubmissions = new Map<string, PendingSubmission>();
  private readonly _ideaDetailSeq = new Map<string, number>();
  private _listRevision = 0;

  // 1. Perspective / Role & Admin Key
  readonly currentRole = signal<UserRole>(this._loadRole());
  readonly adminApiKey = signal<string>(
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('ideahub_admin_key') || '')
      : ''
  );

  setAdminApiKey(key: string): void {
    this.adminApiKey.set(key);
    try {
      if (key) {
        sessionStorage.setItem('ideahub_admin_key', key);
      } else {
        sessionStorage.removeItem('ideahub_admin_key');
      }
    } catch {}
  }

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

  constructor() {
    this._loadPendingSubmissions();
    // Initial fetch from Go API backend
    this.refreshIdeas();
    this.fetchNotifications();
    this._replayPendingSubmissions();

    // Auto-fetch full detail when an idea is opened
    effect(() => {
      const id = this.selectedIdeaId();
      if (id) {
        this.fetchIdeaDetail(id);
      }
    });
  }

  private _getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Voter-Key': CURRENT_CUSTOMER_EMAIL
    });
    const role = this.currentRole();
    if (role === 'team' || role === 'admin') {
      headers = headers.set('X-User-Role', role);
      const key = this.adminApiKey();
      if (key) {
        headers = headers.set('X-Admin-Key', key);
      }
    }
    return headers;
  }

  // Refresh ideas list from Go backend
  refreshIdeas(): void {
    const reqRevision = ++this._listRevision;
    const queryParams = this.showMerged() ? '?include_merged=true' : '';
    this.http.get<IdeaBackendDTO[]>(`${this.API_BASE}/ideas${queryParams}`, { headers: this._getHeaders() })
      .subscribe({
        next: (dtos) => {
          if (!dtos) return;
          // Reject stale snapshot if a local mutation happened while this request was in flight
          if (reqRevision !== this._listRevision) return;

          const existingMap = new Map(this._ideas().map(i => [i.id, i]));

          // Reconcile pending submissions with canonical backend IDs only by exact ID match
          for (const dto of dtos) {
            if (this._pendingSubmissions.has(dto.id)) {
              this._pendingSubmissions.delete(dto.id);
              this._savePendingSubmissions();
            }
          }

          const isTeam = this.isTeamMember();
          const backendList: ProductIdea[] = dtos.map(dto => {
            const prev = existingMap.get(dto.id);
            return {
              id: dto.id,
              title: dto.title,
              description: dto.description,
              category: dto.category,
              status: dto.status,
              authorName: dto.authorName,
              authorEmail: isTeam
                ? (dto.authorEmail || prev?.authorEmail || '')
                : (dto.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : ''),
              upvotes: dto.upvotes,
              upvotedByUser: prev ? prev.upvotedByUser : false,
              subscribedUserEmails: prev?.subscribedUserEmails || [],
              createdAt: dto.createdAt,
              comments: (prev?.comments || []).map(c => ({
                ...c,
                authorEmail: isTeam ? (c.authorEmail || '') : (c.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : '')
              })),
              commentsCount: dto.commentsCount,
              internalNotes: isTeam ? (prev?.internalNotes || []) : [],
              statusHistory: prev?.statusHistory || [],
              mergedIntoId: dto.mergedIntoId,
              mergedIntoTitle: dto.mergedIntoTitle
            };
          });

          // Preserve any locally accepted submissions that have not yet synced
          const pendingIdeas = this._ideas().filter(i => this._pendingSubmissions.has(i.id));
          this._ideas.set([...pendingIdeas, ...backendList]);
          this._saveIdeas();
        },
        error: (err) => {
          console.warn('IdeaHub Go API offline or unreachable, using local storage state:', err);
        }
      });
  }

  // Fetch full detail with comments, internal notes, and audit history
  fetchIdeaDetail(id: string): void {
    const currentSeq = (this._ideaDetailSeq.get(id) || 0) + 1;
    this._ideaDetailSeq.set(id, currentSeq);

    this.http.get<IdeaDetailBackendDTO>(`${this.API_BASE}/ideas/${id}`, { headers: this._getHeaders() })
      .subscribe({
        next: (detail) => {
          if (!detail) return;
          // Reject stale response that precedes a newer edit
          if (this._ideaDetailSeq.get(id) !== currentSeq) return;

          const isTeam = this.isTeamMember();
          this._ideas.update(list =>
            list.map(idea => {
              if (idea.id !== id) return idea;
              return {
                ...idea,
                title: detail.title,
                description: detail.description,
                category: detail.category,
                status: detail.status,
                authorName: detail.authorName,
                authorEmail: isTeam
                  ? (detail.authorEmail || idea.authorEmail)
                  : (detail.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : ''),
                upvotes: detail.upvotes,
                commentsCount: detail.comments?.length ?? detail.commentsCount,
                mergedIntoId: detail.mergedIntoId,
                mergedIntoTitle: detail.mergedIntoTitle,
                subscribedUserEmails: detail.subscribers || [],
                comments: (detail.comments || []).map(c => ({
                  id: c.id,
                  authorName: c.authorName,
                  authorEmail: isTeam ? (c.authorEmail || '') : (c.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : ''),
                  isTeamMember: c.isTeamMember,
                  content: c.content,
                  createdAt: c.createdAt
                })),
                internalNotes: isTeam ? (detail.internalNotes || []).map(n => ({
                  id: n.id,
                  authorName: n.authorName,
                  authorEmail: n.authorEmail || '',
                  content: n.content,
                  createdAt: n.createdAt
                })) : [],
                statusHistory: (detail.statusHistory || []).map(h => ({
                  id: h.id,
                  previousStatus: h.previousStatus,
                  newStatus: h.newStatus,
                  changedBy: h.changedBy,
                  note: h.note || '',
                  timestamp: h.timestamp
                }))
              };
            })
          );
        },
        error: (err) => {
          console.warn(`Could not fetch detail from API for idea ${id}:`, err);
        }
      });
  }

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
        case 'comments-desc': {
          const countA = a.commentsCount ?? a.comments.length;
          const countB = b.commentsCount ?? b.comments.length;
          return countB - countA;
        }
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

    if (role === 'customer') {
      // Immediate confidentiality scrub: Strip all internal notes and private emails
      this._ideas.update(list =>
        list.map(i => ({
          ...i,
          internalNotes: [],
          authorEmail: i.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : '',
          comments: i.comments.map(c => ({
            ...c,
            authorEmail: c.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : ''
          }))
        }))
      );
      this._saveIdeas();
    }

    this.refreshIdeas();
    const activeId = this.selectedIdeaId();
    if (activeId) {
      this.fetchIdeaDetail(activeId);
    }
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
    const tempId = crypto.randomUUID();

    const newIdea: ProductIdea = {
      id: tempId,
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
      commentsCount: 0,
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

    // Track pending submission durably
    const pendingPayload: PendingSubmission = {
      tempId,
      title: newIdea.title,
      description: newIdea.description,
      category: newIdea.category,
      authorName: newIdea.authorName,
      authorEmail: newIdea.authorEmail
    };
    this._pendingSubmissions.set(tempId, pendingPayload);
    this._savePendingSubmissions();
    this._listRevision++;

    // Optimistic UI update
    this._ideas.update(list => [newIdea, ...list]);
    this._saveIdeas();

    // Call Go Fiber API backend with client-generated id for idempotency
    this.http.post<{ id: string; message: string }>(
      `${this.API_BASE}/ideas`,
      {
        id: tempId,
        title: newIdea.title,
        description: newIdea.description,
        category: newIdea.category,
        authorName: newIdea.authorName,
        authorEmail: newIdea.authorEmail
      },
      { headers: this._getHeaders() }
    ).subscribe({
      next: (res) => {
        this._pendingSubmissions.delete(tempId);
        this._savePendingSubmissions();
        const serverId = res?.id || tempId;
        if (this.selectedIdeaId() === tempId) {
          this.selectedIdeaId.set(serverId);
        }
        if (serverId !== tempId) {
          this._ideas.update(list =>
            list.map(i => i.id === tempId ? { ...i, id: serverId } : i)
          );
          this._saveIdeas();
        }
      },
      error: (err) => {
        if (err && err.status === 400) {
          // Validation error from server: discard invalid submission to avoid eternal retries
          this._pendingSubmissions.delete(tempId);
          this._savePendingSubmissions();
          this._ideas.update(list => list.filter(i => i.id !== tempId));
          this._saveIdeas();
        } else {
          console.warn('Submit idea API sync error, preserved in pending storage for replay:', err);
        }
      }
    });

    return newIdea;
  }

  // Toggle Upvote
  toggleUpvote(ideaId: string): void {
    // Invalidate in-flight detail requests and advance revision
    this._ideaDetailSeq.set(ideaId, (this._ideaDetailSeq.get(ideaId) || 0) + 1);
    this._listRevision++;

    let nextUpvotes = 0;
    let willBeUpvoted = false;
    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        const upvoted = !idea.upvotedByUser;
        willBeUpvoted = upvoted;
        const newSubs = upvoted
          ? Array.from(new Set([...idea.subscribedUserEmails, CURRENT_CUSTOMER_EMAIL]))
          : idea.subscribedUserEmails;
        nextUpvotes = upvoted ? idea.upvotes + 1 : Math.max(0, idea.upvotes - 1);

        return {
          ...idea,
          upvotedByUser: upvoted,
          upvotes: nextUpvotes,
          subscribedUserEmails: newSubs,
        };
      })
    );
    this._saveIdeas();

    const action = willBeUpvoted ? 'add' : 'remove';

    // Sync to Go Fiber API using distinct add/remove action and identified voter key
    this.http.post<{ id: string; upvotes: number; action?: string }>(
      `${this.API_BASE}/ideas/${ideaId}/vote`,
      { action, voterKey: CURRENT_CUSTOMER_EMAIL },
      { headers: this._getHeaders() }
    ).subscribe({
      next: (res) => {
        if (res && typeof res.upvotes === 'number') {
          const targetId = res.id || ideaId;
          this._ideas.update(list =>
            list.map(i => (i.id === targetId || i.id === ideaId) ? { ...i, upvotes: res.upvotes } : i)
          );
          this._saveIdeas();
        }
      },
      error: (err) => {
        console.warn('Vote API sync error:', err);
      }
    });
  }

  // Toggle Subscription
  toggleSubscription(ideaId: string): void {
    this._listRevision++;
    let willBeSubscribed = false;
    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        const isSub = idea.subscribedUserEmails.includes(CURRENT_CUSTOMER_EMAIL);
        willBeSubscribed = !isSub;
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

    // Persist subscription on the server so status updates notify across browsers
    this.http.post<{ subscribed: boolean }>(
      `${this.API_BASE}/ideas/${ideaId}/subscribe`,
      { email: CURRENT_CUSTOMER_EMAIL, action: willBeSubscribed ? 'subscribe' : 'unsubscribe' },
      { headers: this._getHeaders() }
    ).subscribe({
      next: (res) => {
        if (res && typeof res.subscribed === 'boolean') {
          this._ideas.update(list =>
            list.map(i => {
              if (i.id !== ideaId) return i;
              const hasIt = i.subscribedUserEmails.includes(CURRENT_CUSTOMER_EMAIL);
              let nextSubs = i.subscribedUserEmails;
              if (res.subscribed && !hasIt) {
                nextSubs = [...i.subscribedUserEmails, CURRENT_CUSTOMER_EMAIL];
              } else if (!res.subscribed && hasIt) {
                nextSubs = i.subscribedUserEmails.filter(e => e !== CURRENT_CUSTOMER_EMAIL);
              }
              return { ...i, subscribedUserEmails: nextSubs };
            })
          );
          this._saveIdeas();
        }
      },
      error: (err) => console.warn('Subscription server sync error:', err)
    });
  }

  isSubscribed(idea: ProductIdea): boolean {
    return idea.subscribedUserEmails.includes(CURRENT_CUSTOMER_EMAIL);
  }

  // Add Public Comment
  addPublicComment(ideaId: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) return;

    // Invalidate earlier in-flight details
    this._ideaDetailSeq.set(ideaId, (this._ideaDetailSeq.get(ideaId) || 0) + 1);

    const role = this.currentRole();
    const isTeam = role === 'team' || role === 'admin';
    const authorName = isTeam ? 'Product Team' : CURRENT_CUSTOMER_NAME;
    const authorEmail = isTeam ? 'team@company.internal' : CURRENT_CUSTOMER_EMAIL;

    const comment: Comment = {
      id: crypto.randomUUID(),
      authorName,
      authorEmail,
      isTeamMember: isTeam,
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;
        const updatedComments = [...idea.comments, comment];
        return {
          ...idea,
          comments: updatedComments,
          commentsCount: updatedComments.length,
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

    // Sync to Go Fiber API
    this.http.post<{ id: string }>(
      `${this.API_BASE}/ideas/${ideaId}/comments`,
      {
        authorName,
        authorEmail,
        content: trimmed,
        isInternal: false
      },
      { headers: this._getHeaders() }
    ).subscribe({
      next: () => {
        this.fetchIdeaDetail(ideaId);
      },
      error: (err) => console.warn('Comment API sync error:', err)
    });
  }

  // Add Internal Note (Team & Admin only)
  addInternalNote(ideaId: string, content: string): void {
    if (!this.isTeamMember()) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    // Invalidate earlier in-flight details
    this._ideaDetailSeq.set(ideaId, (this._ideaDetailSeq.get(ideaId) || 0) + 1);

    const authorName = this.isAdmin() ? 'David Park (Admin)' : 'Mike Chen (Team)';
    const authorEmail = 'team@internal.corp';

    const note: InternalTeamNote = {
      id: crypto.randomUUID(),
      authorName,
      authorEmail,
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

    // Sync to Go Fiber API
    this.http.post<{ id: string }>(
      `${this.API_BASE}/ideas/${ideaId}/comments`,
      {
        authorName,
        authorEmail,
        content: trimmed,
        isInternal: true
      },
      { headers: this._getHeaders() }
    ).subscribe({
      next: () => {
        this.fetchIdeaDetail(ideaId);
      },
      error: (err) => console.warn('Internal note API sync error:', err)
    });
  }

  // Update Status & Async Notification with Public Note
  updateStatus(ideaId: string, newStatus: IdeaStatus, publicNote: string): void {
    if (!this.isTeamMember()) return;

    const previousIdea = this._ideas().find(i => i.id === ideaId);
    if (!previousIdea) return;
    const prevStatus = previousIdea.status;
    const prevHistory = [...previousIdea.statusHistory];

    // Invalidate in-flight details & advance revision
    this._ideaDetailSeq.set(ideaId, (this._ideaDetailSeq.get(ideaId) || 0) + 1);
    this._listRevision++;

    const changedBy = this.isAdmin() ? 'David Park (Admin)' : 'Sarah Johnson (Team)';
    const noteText = publicNote.trim() || `Status updated to ${this.formatStatusLabel(newStatus)}.`;

    let targetIdea: ProductIdea | undefined;

    this._ideas.update(list =>
      list.map(idea => {
        if (idea.id !== ideaId) return idea;

        const historyItem = {
          id: crypto.randomUUID(),
          previousStatus: prevStatus,
          newStatus,
          changedBy,
          note: noteText,
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

    // Sync to Go Fiber API
    this.http.post<{ id: string; newStatus: string }>(
      `${this.API_BASE}/ideas/${ideaId}/status`,
      {
        status: newStatus,
        note: noteText,
        changedBy
      },
      { headers: this._getHeaders() }
    ).subscribe({
      next: () => {
        // Dispatch notifications only after server accepts the status update
        if (targetIdea) {
          this._dispatchAsyncNotifications(targetIdea, newStatus, publicNote.trim());
        }
        this.fetchIdeaDetail(ideaId);
      },
      error: (err) => {
        console.warn('Status update API sync error, reverting local status:', err);
        // Recover local state from rejected status update
        this._ideas.update(list =>
          list.map(idea => idea.id === ideaId ? { ...idea, status: prevStatus, statusHistory: prevHistory } : idea)
        );
        this._saveIdeas();
        this.fetchIdeaDetail(ideaId);
      }
    });
  }

  // Merge Duplicate Feedback
  mergeIdeas(sourceIdeaId: string, targetIdeaId: string, mergeNote?: string): void {
    if (!this.isTeamMember()) return;
    if (sourceIdeaId === targetIdeaId) return;

    // Invalidate in-flight detail requests for both source and target ideas
    this._ideaDetailSeq.set(sourceIdeaId, (this._ideaDetailSeq.get(sourceIdeaId) || 0) + 1);
    this._ideaDetailSeq.set(targetIdeaId, (this._ideaDetailSeq.get(targetIdeaId) || 0) + 1);
    this._listRevision++;

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

    // Sync to Go Fiber API
    this.http.post(
      `${this.API_BASE}/ideas/merge`,
      {
        sourceIdeaId,
        targetIdeaId,
        note: noteText
      },
      { headers: this._getHeaders() }
    ).subscribe({
      next: () => {
        this.refreshIdeas();
        this.fetchIdeaDetail(target.id);
      },
      error: (err) => console.warn('Merge ideas API sync error:', err)
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

    // Sync to Go Fiber API
    this.http.delete(
      `${this.API_BASE}/ideas/${ideaId}`,
      { headers: this._getHeaders() }
    ).subscribe({
      error: (err) => console.warn('Delete idea API sync error:', err)
    });
  }

  toggleShowMerged(): void {
    const willShow = !this.showMerged();
    this.showMerged.set(willShow);
    if (willShow) {
      this.refreshIdeas();
    }
  }

  // Export to CSV (Section 8 of SPEC.MD)
  exportToCsv(): void {
    if (this.isAdmin()) {
      this.http.get(`${this.API_BASE}/export/csv`, {
        headers: this._getHeaders(),
        responseType: 'blob'
      }).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `ideahub-feedback-export-${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },
        error: () => this._generateClientCsv()
      });
      return;
    }

    this._generateClientCsv();
  }

  private _generateClientCsv(): void {
    const list = this._ideas();
    const headers = ['Title', 'Category', 'Status', 'Vote Count', 'Submission Date', 'Submitter Display Name', 'Submitter Email'];
    
    const escapeCsvCell = (val: string | number): string => {
      let str = String(val ?? '');
      // Prevent CSV formula injection by prefixing with an apostrophe if it starts with =, +, -, @, \t, or \r
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const isTeam = this.isTeamMember();
    const rows = list.map(i => [
      escapeCsvCell(i.title),
      escapeCsvCell(i.category),
      escapeCsvCell(this.formatStatusLabel(i.status)),
      i.upvotes,
      escapeCsvCell(i.createdAt),
      escapeCsvCell(i.authorName),
      escapeCsvCell(isTeam ? i.authorEmail : (i.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : '***@***.***')),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ideahub-feedback-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Notifications logic
  markNotificationRead(id: string): void {
    this._notifications.update(list => list.map(n => (n.id === id ? { ...n, read: true } : n)));
    this._saveNotifications();
  }

  markAllNotificationsRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
    this._saveNotifications();
  }

  togglePreference(key: keyof NotificationPreferences): void {
    this.notificationPreferences.update(prefs => {
      const next = { ...prefs, [key]: !prefs[key] };
      try {
        localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  formatStatusLabel(status: IdeaStatus): string {
    switch (status) {
      case 'under-review':
        return 'Under Review';
      case 'planned':
        return 'Planned';
      case 'in-progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'declined':
        return 'Declined';
      case 'merged':
        return 'Merged';
      default:
        return status;
    }
  }

  private _dispatchAsyncNotifications(idea: ProductIdea, newStatus: IdeaStatus, note: string): void {
    const prefs = this.notificationPreferences();
    if (!prefs.inAppAlerts) return;

    const statusText = this.formatStatusLabel(newStatus);
    const recipients = idea.subscribedUserEmails;

    recipients.forEach(email => {
      this._createNotification({
        ideaId: idea.id,
        ideaTitle: idea.title,
        recipientEmail: email,
        status: newStatus,
        message: `Status changed to ${statusText}${note ? `: "${note}"` : '.'}`,
      });
    });
  }

  private _createNotification(params: {
    ideaId: string;
    ideaTitle: string;
    recipientEmail: string;
    status: IdeaStatus;
    message: string;
  }): void {
    const newNotif: CustomerNotification = {
      id: crypto.randomUUID(),
      ideaId: params.ideaId,
      ideaTitle: params.ideaTitle,
      recipientEmail: params.recipientEmail,
      message: params.message,
      status: params.status,
      createdAt: new Date().toISOString(),
      read: false,
    };

    this._notifications.update(list => [newNotif, ...list]);
    this._saveNotifications();
  }

  fetchNotifications(): void {
    const email = CURRENT_CUSTOMER_EMAIL;
    this.http.get<Array<{
      id: string;
      ideaId: string;
      eventType: string;
      title: string;
      message: string;
      status: string;
      createdAt: string;
    }>>(`${this.API_BASE}/notifications?email=${encodeURIComponent(email)}`, {
      headers: this._getHeaders()
    }).subscribe({
      next: (serverNotifs) => {
        if (!serverNotifs) return;
        const mapped: CustomerNotification[] = serverNotifs.map(n => ({
          id: n.id,
          ideaId: n.ideaId,
          ideaTitle: n.title,
          recipientEmail: email,
          message: n.message,
          status: (n.status as IdeaStatus) || 'under-review',
          createdAt: n.createdAt,
          read: false
        }));

        this._notifications.update(local => {
          const localMap = new Map(local.map(l => [l.id, l]));
          for (const s of mapped) {
            if (!localMap.has(s.id)) {
              localMap.set(s.id, s);
            }
          }
          return Array.from(localMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        this._saveNotifications();
      },
      error: (err) => {
        console.warn('Could not fetch server notifications:', err);
      }
    });
  }

  private _saveIdeas(): void {
    try {
      const isTeam = this.isTeamMember();
      const payload = isTeam
        ? this._ideas()
        : this._ideas().map(i => ({
            ...i,
            authorEmail: i.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : '',
            internalNotes: [],
            comments: (i.comments || []).map(c => ({
              ...c,
              authorEmail: c.authorName === CURRENT_CUSTOMER_NAME ? CURRENT_CUSTOMER_EMAIL : ''
            }))
          }));
      localStorage.setItem(STORAGE_IDEAS_KEY, JSON.stringify(payload));
    } catch {}
  }

  private _savePendingSubmissions(): void {
    try {
      const arr = Array.from(this._pendingSubmissions.values());
      localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(arr));
    } catch {}
  }

  private _loadPendingSubmissions(): void {
    try {
      const raw = localStorage.getItem(STORAGE_PENDING_KEY);
      if (raw) {
        const arr: PendingSubmission[] = JSON.parse(raw);
        for (const item of arr) {
          this._pendingSubmissions.set(item.tempId, item);
        }
      }
    } catch {}
  }

  private _replayPendingSubmissions(): void {
    if (this._pendingSubmissions.size === 0) return;
    for (const [tempId, item] of this._pendingSubmissions.entries()) {
      this.http.post<{ id: string; message: string }>(
        `${this.API_BASE}/ideas`,
        {
          id: item.tempId,
          title: item.title,
          description: item.description,
          category: item.category,
          authorName: item.authorName,
          authorEmail: item.authorEmail
        },
        { headers: this._getHeaders() }
      ).subscribe({
        next: (res) => {
          this._pendingSubmissions.delete(tempId);
          this._savePendingSubmissions();
          const serverId = res?.id || tempId;
          if (this.selectedIdeaId() === tempId) {
            this.selectedIdeaId.set(serverId);
          }
          if (serverId !== tempId) {
            this._ideas.update(list =>
              list.map(i => i.id === tempId ? { ...i, id: serverId } : i)
            );
            this._saveIdeas();
          }
        },
        error: (err) => {
          if (err && err.status === 400) {
            this._pendingSubmissions.delete(tempId);
            this._savePendingSubmissions();
          }
          console.warn('Pending replay error for', tempId, err);
        }
      });
    }
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
