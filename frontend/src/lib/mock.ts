// Election starts in the future so the floating island shows the pre-voting state.
const now = Date.now();
export const ELECTION = {
  name: "Student Council Election 2025",
  votingStart: new Date(now + 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 60 * 14 + 1000 * 60 * 32),
  votingEnd: new Date(now + 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 60 * 22),
  registrationEnd: new Date(now + 1000 * 60 * 60 * 24),
};

export type Candidate = {
  id: string;
  name: string;
  department: string;
  semester: string;
  party: string;
  position: "President" | "Vice President" | "General Secretary";
  match: number;
  manifesto: string;
  coverage: number;
  status: "Pending" | "Under Review" | "Approved" | "Rejected";
  payment: "Paid" | "Pending";
  email: string;
  symbol?: string;
  runningMates?: { vicePresident: string; secretary: string };
};

export const CANDIDATES: Candidate[] = [
  { id: "c1", name: "Priya Sharma", department: "CSE", semester: "6th", party: "Progressive Students Alliance", position: "President", match: 87, coverage: 78, status: "Approved", payment: "Paid", email: "priya.sharma@college.edu.in",
    symbol: "🌅", runningMates: { vicePresident: "Kavya Reddy", secretary: "Neha Pillai" },
    manifesto: "Modernize campus Wi-Fi to fiber backbone, expand placement training from 2nd year, launch student welfare initiatives." },
  { id: "c2", name: "Arjun Mehta", department: "ECE", semester: "8th", party: "United Campus Front", position: "President", match: 61, coverage: 62, status: "Approved", payment: "Paid", email: "arjun.mehta@college.edu.in",
    symbol: "🦅", runningMates: { vicePresident: "Rahul Verma", secretary: "Rohan Gupta" },
    manifesto: "Better hostel facilities, improved cafeteria food quality, and active sports culture across all departments." },
  { id: "c3", name: "Kavya Reddy", department: "ME", semester: "6th", party: "Student Voice Party", position: "Vice President", match: 74, coverage: 70, status: "Approved", payment: "Paid", email: "kavya.reddy@college.edu.in",
    manifesto: "Inter-department fests, gender-inclusive policies, transparent budget allocation for student bodies." },
  { id: "c4", name: "Rohan Gupta", department: "MBA", semester: "4th", party: "Campus Unity", position: "General Secretary", match: 55, coverage: 48, status: "Under Review", payment: "Paid", email: "rohan.gupta@college.edu.in",
    manifesto: "Industry collaborations, technical clubs, improved lab infrastructure across engineering branches." },
];

export const VOTER = { name: "Aditya Rao", department: "CSE", year: "2nd Year", studentId: "CS2021001", voted: false };
export const CANDIDATE_USER = { name: "Priya Sharma", department: "CSE", year: "3rd Year", position: "President" as const, status: "Approved" };
export const ADMIN_USER = { name: "Dr. Meena Iyer", department: "Election Committee", role: "Chief Election Officer" };

export const CONCERN_CATEGORIES = [
  { name: "Wi-Fi & Infrastructure", mentions: 412, positive: 5, neutral: 28, negative: 67, covered: true },
  { name: "Placements", mentions: 387, positive: 12, neutral: 35, negative: 53, covered: true },
  { name: "Hostel Facilities", mentions: 298, positive: 8, neutral: 22, negative: 70, covered: false },
  { name: "Cafeteria", mentions: 201, positive: 15, neutral: 45, negative: 40, covered: false },
  { name: "Transportation", mentions: 156, positive: 3, neutral: 31, negative: 66, covered: false },
  { name: "Sports & Events", mentions: 134, positive: 28, neutral: 52, negative: 20, covered: true },
  { name: "Mental Health", mentions: 89, positive: 6, neutral: 29, negative: 65, covered: false },
];

export const HOURLY_VOTES = [
  { hour: "9 AM", votes: 45, baseline: 60 },
  { hour: "10 AM", votes: 112, baseline: 90 },
  { hour: "11 AM", votes: 89, baseline: 95 },
  { hour: "12 PM", votes: 134, baseline: 100 },
  { hour: "1 PM", votes: 67, baseline: 80 },
  { hour: "2 PM", votes: 380, baseline: 90 },
  { hour: "3 PM", votes: 91, baseline: 95 },
];

export const DEPT_TURNOUT = [
  { dept: "CSE", turnout: 62 },
  { dept: "ECE", turnout: 48 },
  { dept: "ME",  turnout: 39 },
  { dept: "MBA", turnout: 55 },
  { dept: "Civil", turnout: 31 },
];

export const NOTIFICATIONS = [
  { id: 1, title: "Voting opens tomorrow at 9 AM", time: "2 hours ago", unread: true, type: "announcement" },
  { id: 2, title: "Your application has been approved", time: "5 hours ago", unread: true, type: "system" },
  { id: 3, title: "AI Report is ready", time: "1 day ago", unread: false, type: "system" },
  { id: 4, title: "OTP verification successful", time: "2 days ago", unread: false, type: "otp" },
  { id: 5, title: "Manifesto submitted successfully", time: "3 days ago", unread: false, type: "system" },
];

export const AI_ALERTS = [
  { id: 1, severity: "HIGH" as const, title: "IP Clustering — Lab Block B", detail: "47 sessions from 192.168.10.x/24", time: "14:22" },
  { id: 2, severity: "MEDIUM" as const, title: "Vote Velocity Spike", detail: "14:22–14:27 — 4.2x above baseline", time: "14:27" },
  { id: 3, severity: "MEDIUM" as const, title: "Repeated Failed OTP", detail: "Session sx_8421 — 5 failures in 90s", time: "13:48" },
];

export const AUDIT_LOGS = Array.from({ length: 20 }).map((_, i) => {
  const events = ["LOGIN", "VOTE_CAST", "CANDIDATE_APPROVED", "OTP_REQUESTED", "ADMIN_ACTION"] as const;
  const sevs = ["success", "success", "success", "warning", "security"] as const;
  const evt = events[i % events.length];
  return {
    id: i + 1,
    ts: new Date(now - i * 1000 * 60 * 17).toISOString().replace("T", " ").slice(0, 19),
    event: evt,
    actor: i % 3 === 0 ? "admin@college.edu" : `student_${1000 + i}@college.edu`,
    ip: `192.168.${10 + (i % 4)}.${20 + i}`,
    desc: `${evt.toLowerCase().replace("_", " ")} recorded`,
    level: sevs[i % sevs.length],
  };
});

export const KPI = { registered: 1240, votesCast: 538, turnout: 43.4, alerts: 5 };

export type MediaItem = {
  id: string;
  candidateId: string;
  candidateName: string;
  party: string;
  type: "video" | "poster" | "message" | "manifesto";
  title: string;
  body?: string;
  url?: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: string;
};

export const MEDIA_ITEMS: MediaItem[] = [
  { id: "m1", candidateId: "c1", candidateName: "Priya Sharma", party: "Progressive Students Alliance", type: "video", title: "My vision for campus", url: "campaign-video.mp4", status: "Approved", submittedAt: "Oct 28" },
  { id: "m2", candidateId: "c1", candidateName: "Priya Sharma", party: "Progressive Students Alliance", type: "poster", title: "Vote for Progress", url: "poster-1.png", status: "Approved", submittedAt: "Oct 28" },
  { id: "m3", candidateId: "c1", candidateName: "Priya Sharma", party: "Progressive Students Alliance", type: "message", title: "A note to fellow students", body: "Together we can modernize our campus, improve placements, and put student welfare first.", status: "Approved", submittedAt: "Oct 29" },
  { id: "m4", candidateId: "c2", candidateName: "Arjun Mehta", party: "United Campus Front", type: "video", title: "Hostel & cafeteria fixes", url: "arjun-video.mp4", status: "Pending", submittedAt: "Oct 30" },
  { id: "m5", candidateId: "c2", candidateName: "Arjun Mehta", party: "United Campus Front", type: "poster", title: "United for Change", url: "arjun-poster.png", status: "Approved", submittedAt: "Oct 29" },
];

export type VoterConcern = {
  id: string;
  fromName: string;
  department: string;
  toCandidateId: string;
  category: string;
  message: string;
  submittedAt: string;
};

export const VOTER_CONCERNS: VoterConcern[] = [
  { id: "vc1", fromName: "Aditya Rao", department: "CSE", toCandidateId: "c1", category: "Wi-Fi & Infrastructure", message: "Wi-Fi in Block C is unreliable during peak hours.", submittedAt: "Oct 30, 11:22 AM" },
  { id: "vc2", fromName: "Sneha Joshi", department: "ECE", toCandidateId: "c2", category: "Cafeteria", message: "Please prioritize hygiene audits for the main cafeteria.", submittedAt: "Oct 29, 4:10 PM" },
];

export const RESULTS = [
  { position: "President", candidates: [{ name: "Priya Sharma", votes: 312 }, { name: "Arjun Mehta", votes: 226 }] },
  { position: "Vice President", candidates: [{ name: "Kavya Reddy", votes: 298 }, { name: "Other", votes: 240 }] },
  { position: "General Secretary", candidates: [{ name: "Rohan Gupta", votes: 270 }, { name: "Other", votes: 268 }] },
];
