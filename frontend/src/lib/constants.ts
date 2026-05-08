// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    VERIFY_OTP: '/auth/verify-otp',
    ME: '/auth/me',
  },
  VOTE: {
    SUBMIT: '/vote/submit',
    VERIFY: '/vote/verify',
    JIT_TOKEN: '/vote/jit-token',
    RECEIPT: '/vote/receipt',
  },
  CANDIDATES: {
    LIST: '/candidates',
    APPLY: '/candidates/apply',
    APPROVE: '/candidates/approve',
    REJECT: '/candidates/reject',
  },
  CONCERNS: {
    LIST: '/concerns',
    CREATE: '/concerns',
    UPVOTE: '/concerns/upvote',
    REPORT: '/concerns/report',
  },
  ELECTION: {
    CURRENT: '/election/current',
    CREATE: '/election/create',
    UPDATE: '/election/update',
    START: '/election/start',
    STOP: '/election/stop',
    RESULTS: '/election/results',
  },
  ANALYTICS: {
    STATS: '/analytics/stats',
    DEPARTMENT: '/analytics/department',
    HOURLY: '/analytics/hourly',
    PARTICIPATION: '/analytics/participation',
  },
  AI: {
    CLASSIFY: '/ai/classify',
    RECOMMEND: '/ai/recommend',
    ANALYZE_MANIFESTO: '/ai/analyze-manifesto',
    FRAUD_ALERTS: '/ai/fraud-alerts',
  },
  ADMIN: {
    USERS: '/admin/users',
    AUDIT_LOGS: '/admin/audit-logs',
    FRAUD_ALERTS: '/admin/fraud-alerts',
  },
} as const;

// App Routes
export const ROUTES = {
  HOME: '/',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    FORGOT_PASSWORD: '/auth/forgot-password',
    VERIFY_OTP: '/auth/verify-otp',
  },
  STUDENT: {
    DASHBOARD: '/student/dashboard',
    VOTE: '/student/vote',
    CONCERNS: '/student/concerns',
    RECOMMENDATIONS: '/student/recommendations',
    STATISTICS: '/student/statistics',
  },
  CANDIDATE: {
    DASHBOARD: '/candidate/dashboard',
    MANIFESTO: '/candidate/manifesto',
    REPORTS: '/candidate/reports',
    APPLICATION: '/candidate/application',
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    ANALYTICS: '/admin/analytics',
    ELECTION_CONTROL: '/admin/election-control',
    FRAUD_ALERTS: '/admin/fraud-alerts',
    AUDIT_LOGS: '/admin/audit-logs',
  },
} as const;

// Election Constants
export const ELECTION_STATUS = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// Concern Categories
export const CONCERN_CATEGORIES = [
  { value: 'academic', label: 'Academic', icon: '📚' },
  { value: 'infrastructure', label: 'Infrastructure', icon: '🏗️' },
  { value: 'campus_life', label: 'Campus Life', icon: '🎓' },
  { value: 'administration', label: 'Administration', icon: '🏛️' },
  { value: 'other', label: 'Other', icon: '📋' },
] as const;

// Positions
export const POSITIONS = [
  'President',
  'Vice President',
  'General Secretary',
  'Treasurer',
  'Cultural Secretary',
  'Sports Secretary',
  'Technical Secretary',
  'Class Representative',
] as const;
