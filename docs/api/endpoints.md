# API Documentation

## Base URL
- **Backend API**: `http://localhost:8000/api/v1`
- **AI Service**: `http://localhost:8001/api`

## Authentication
All protected endpoints require a Bearer JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/register` | Register new account |
| POST | `/auth/logout` | Logout and invalidate token |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Request password reset OTP |
| POST | `/auth/verify-otp` | Verify OTP code |
| GET | `/auth/me` | Get current user profile |

### Voting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/vote/submit` | Submit a vote |
| POST | `/vote/jit-token` | Get JIT verification token |
| POST | `/vote/verify` | Verify vote receipt |
| GET | `/vote/receipt` | Get vote receipt |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/candidates` | List candidates |
| POST | `/candidates/apply` | Apply as candidate |
| POST | `/candidates/approve/:id` | Approve candidate (admin) |
| POST | `/candidates/reject/:id` | Reject candidate (admin) |

### Concerns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/concerns` | List concerns |
| POST | `/concerns` | Create concern |
| POST | `/concerns/upvote/:id` | Upvote concern |
| GET | `/concerns/report` | Get concern report |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List users |
| GET | `/admin/audit-logs` | Get audit logs |
| GET | `/admin/fraud-alerts` | Get fraud alerts |
| POST | `/admin/fraud-alerts/:id/resolve` | Resolve alert |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/stats` | Election statistics |
| GET | `/analytics/department` | Department breakdown |
| GET | `/analytics/hourly` | Hourly vote trends |
| GET | `/analytics/participation` | Participation rate |
