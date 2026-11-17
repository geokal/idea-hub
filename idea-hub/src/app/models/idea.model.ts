export type IdeaStatus = 'under-review' | 'planned' | 'in-progress' | 'completed' | 'declined' | 'merged';
export type IdeaCategory = 'Core Feature' | 'UI / UX' | 'Performance' | 'Integrations' | 'Mobile';
export type UserRole = 'customer' | 'team' | 'admin';
export type SortOption = 'upvotes-desc' | 'date-desc' | 'comments-desc';

// Public Comment visible to everyone
export interface Comment {
  id: string;
  authorName: string;
  authorEmail: string;
  isTeamMember: boolean;
  content: string;
  createdAt: string;
}

// Structurally separated Internal Note (accessible only to Team & Admin)
export interface InternalTeamNote {
  id: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

export interface StatusHistory {
  id: string;
  previousStatus: IdeaStatus;
  newStatus: IdeaStatus;
  changedBy: string;
  note: string;
  timestamp: string;
}

export interface CustomerNotification {
  id: string;
  ideaId: string;
  ideaTitle: string;
  recipientEmail: string;
  message: string;
  status: IdeaStatus;
  createdAt: string;
  read: boolean;
}

export interface NotificationPreferences {
  emailUpdates: boolean;
  inAppAlerts: boolean;
}

export interface ProductIdea {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  authorName: string;
  authorEmail: string;
  upvotes: number;
  upvotedByUser: boolean;
  subscribedUserEmails: string[];
  createdAt: string;
  comments: Comment[];
  commentsCount?: number;
  internalNotes: InternalTeamNote[];
  statusHistory: StatusHistory[];
  mergedIntoId?: string;
  mergedIntoTitle?: string;
}
