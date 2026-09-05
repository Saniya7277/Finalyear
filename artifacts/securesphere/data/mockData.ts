export type FileType = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'txt';
export type Permission = 'viewer' | 'editor' | 'owner';
export type InviteStatus = 'pending' | 'accepted' | 'rejected';

export interface SecureFile {
  id: string;
  name: string;
  type: FileType;
  size: string;
  encrypted: boolean;
  shared: boolean;
  ownerId: string;
  sharedWith: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  online: boolean;
  role: Permission;
  inviteStatus?: InviteStatus;
  storageUsed: number;
  storageTotal: number;
  securityScore: number;
}

export interface Notification {
  id: string;
  type: 'share' | 'invite' | 'security' | 'upload' | 'system';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  userId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

export const CURRENT_USER: User = {
  id: 'current',
  name: 'Alex Carter',
  email: 'alex.carter@securesphere.io',
  avatarColor: '#00D4FF',
  online: true,
  role: 'owner',
  storageUsed: 4.2,
  storageTotal: 15,
  securityScore: 87,
};

export const DUMMY_USERS: User[] = [
  { id: 'u1', name: 'Alice Johnson', email: 'alice@securesphere.io', avatarColor: '#FF6B9D', online: true, role: 'editor', inviteStatus: 'accepted', storageUsed: 2.1, storageTotal: 10, securityScore: 92 },
  { id: 'u2', name: 'Bob Martinez', email: 'bob@securesphere.io', avatarColor: '#00E676', online: false, role: 'viewer', inviteStatus: 'accepted', storageUsed: 1.5, storageTotal: 10, securityScore: 75 },
  { id: 'u3', name: 'John Smith', email: 'john@securesphere.io', avatarColor: '#FF8C00', online: true, role: 'editor', inviteStatus: 'accepted', storageUsed: 3.8, storageTotal: 10, securityScore: 88 },
  { id: 'u4', name: 'Emma Wilson', email: 'emma@securesphere.io', avatarColor: '#B44FFF', online: false, role: 'viewer', inviteStatus: 'pending', storageUsed: 0.8, storageTotal: 10, securityScore: 95 },
  { id: 'u5', name: 'Michael Brown', email: 'michael@securesphere.io', avatarColor: '#00D4FF', online: true, role: 'editor', inviteStatus: 'accepted', storageUsed: 5.2, storageTotal: 10, securityScore: 81 },
  { id: 'u6', name: 'Sophia Lee', email: 'sophia@securesphere.io', avatarColor: '#FF3B5C', online: true, role: 'viewer', inviteStatus: 'accepted', storageUsed: 2.9, storageTotal: 10, securityScore: 90 },
  { id: 'u7', name: 'Varsha Patel', email: 'varsha@securesphere.io', avatarColor: '#0066FF', online: false, role: 'viewer', inviteStatus: 'pending', storageUsed: 1.1, storageTotal: 10, securityScore: 85 },
];

export const DUMMY_FILES: SecureFile[] = [
  { id: 'f1', name: 'Q4 Financial Report.pdf', type: 'pdf', size: '2.4 MB', encrypted: true, shared: true, ownerId: 'current', sharedWith: ['u1', 'u3'], createdAt: '2026-07-20', modifiedAt: '2026-07-21' },
  { id: 'f2', name: 'Project Proposal.docx', type: 'docx', size: '1.1 MB', encrypted: true, shared: false, ownerId: 'current', sharedWith: [], createdAt: '2026-07-18', modifiedAt: '2026-07-18' },
  { id: 'f3', name: 'Team Presentation.pptx', type: 'pptx', size: '8.7 MB', encrypted: true, shared: true, ownerId: 'current', sharedWith: ['u1', 'u2', 'u3'], createdAt: '2026-07-15', modifiedAt: '2026-07-19' },
  { id: 'f4', name: 'Budget Tracker.xlsx', type: 'xlsx', size: '0.9 MB', encrypted: false, shared: false, ownerId: 'current', sharedWith: [], createdAt: '2026-07-10', modifiedAt: '2026-07-10' },
  { id: 'f5', name: 'System Architecture.pdf', type: 'pdf', size: '4.2 MB', encrypted: true, shared: true, ownerId: 'u1', sharedWith: ['current'], createdAt: '2026-07-08', modifiedAt: '2026-07-09' },
  { id: 'f6', name: 'Profile Photo.image', type: 'image', size: '3.1 MB', encrypted: false, shared: false, ownerId: 'current', sharedWith: [], createdAt: '2026-07-05', modifiedAt: '2026-07-05' },
  { id: 'f7', name: 'Security Audit.pdf', type: 'pdf', size: '1.8 MB', encrypted: true, shared: true, ownerId: 'u3', sharedWith: ['current', 'u1'], createdAt: '2026-07-01', modifiedAt: '2026-07-02' },
  { id: 'f8', name: 'API Documentation.docx', type: 'docx', size: '2.2 MB', encrypted: true, shared: false, ownerId: 'current', sharedWith: [], createdAt: '2026-06-28', modifiedAt: '2026-06-30' },
  { id: 'f9', name: 'Design Assets.image', type: 'image', size: '12.4 MB', encrypted: false, shared: true, ownerId: 'current', sharedWith: ['u6'], createdAt: '2026-06-25', modifiedAt: '2026-06-25' },
  { id: 'f10', name: 'Employee Data.xlsx', type: 'xlsx', size: '1.6 MB', encrypted: true, shared: false, ownerId: 'current', sharedWith: [], createdAt: '2026-06-20', modifiedAt: '2026-06-22' },
];

export const DUMMY_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'share', title: 'File Shared', message: 'Alice Johnson shared "System Architecture.pdf" with you', createdAt: '2026-07-22T10:30:00Z', read: false, userId: 'u1' },
  { id: 'n2', type: 'invite', title: 'Collaboration Invite', message: 'Bob Martinez invited you to collaborate on a project', createdAt: '2026-07-22T09:15:00Z', read: false, userId: 'u2' },
  { id: 'n3', type: 'security', title: 'Security Alert', message: 'New login detected from an unknown device', createdAt: '2026-07-21T18:00:00Z', read: true },
  { id: 'n4', type: 'upload', title: 'Upload Complete', message: 'Q4 Financial Report.pdf has been encrypted and uploaded', createdAt: '2026-07-21T14:30:00Z', read: true },
  { id: 'n5', type: 'security', title: 'Encryption Updated', message: 'Your files have been re-encrypted with AES-256', createdAt: '2026-07-20T11:00:00Z', read: true },
  { id: 'n6', type: 'invite', title: 'Invite Accepted', message: 'Emma Wilson accepted your collaboration invite', createdAt: '2026-07-19T16:45:00Z', read: true, userId: 'u4' },
  { id: 'n7', type: 'share', title: 'File Accessed', message: 'John Smith viewed "Security Audit.pdf"', createdAt: '2026-07-18T13:20:00Z', read: true, userId: 'u3' },
];

export const INITIAL_CHAT: ChatMessage[] = [
  { id: 'c1', role: 'ai', content: 'Hello! I\'m SecureAI, your privacy-preserving intelligence assistant. All conversations are end-to-end encrypted and never leave your device.\n\nHow can I help protect your data today?', timestamp: '2026-07-22T10:00:00Z' },
  { id: 'c2', role: 'user', content: 'What\'s my current security score?', timestamp: '2026-07-22T10:01:00Z' },
  { id: 'c3', role: 'ai', content: 'Your security score is **87/100** — Excellent! Here\'s your breakdown:\n\n• File Encryption: 95% ✓\n• Access Controls: 88% ✓\n• Two-Factor Auth: Not enabled ⚠️\n• Sharing Permissions: 80% ✓\n\nEnable 2FA to boost your score by +8 points.', timestamp: '2026-07-22T10:01:15Z' },
  { id: 'c4', role: 'user', content: 'How can I improve my privacy?', timestamp: '2026-07-22T10:02:00Z' },
  { id: 'c5', role: 'ai', content: 'Here are your top 3 privacy recommendations:\n\n1. **Enable 2FA** — Prevents unauthorized access even if your password is compromised.\n\n2. **Review shared files** — 3 files shared with 5 collaborators. Consider revoking access for inactive members.\n\n3. **Encrypt unprotected files** — 2 files in your vault are not encrypted. Enable encryption for maximum security.', timestamp: '2026-07-22T10:02:10Z' },
];

export function getUserById(id: string): User | undefined {
  if (id === 'current') return CURRENT_USER;
  return DUMMY_USERS.find(u => u.id === id);
}

export function getFileById(id: string): SecureFile | undefined {
  return DUMMY_FILES.find(f => f.id === id);
}
