# HFNI Connect

## Overview

HFNI Connect is a full-stack, multi-tenant church management web application. Its primary purpose is to provide churches with tools for member tracking, attendance management via QR code and OTP login, prayer request submission, ministry group organization, and administrative dashboards. The application ensures data isolation for each church through a `church_id` filter on all database queries.

Key capabilities include:
- **Member Management**: Tracking members and their families.
- **Attendance**: Secure meeting check-in system with 6-character codes and QR scanning.
- **Engagement**: Prayer request submission, dues tracking, announcements, and in-app notifications.
- **Community**: Ministry group management, volunteer requests, and carpooling features.
- **Administration**: Dashboards for managing members, meetings, groups, and content.
- **Celebrations**: Birthday and wedding anniversary tracking with daily admin notifications.

The system supports two user roles:
- **Members**: Pre-created by administrators, log in via phone number and SMS OTP, can mark attendance, submit prayer requests, and interact with ministry groups.
- **Admin/Staff**: Log in via email/password, manage all aspects of the church, including members, events, prayer cells, ministry groups, and view various dashboards.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: EJS (Embedded JavaScript) server-rendered templates.
- **Styling**: Custom CSS for a clean, utility-focused interface with HFNI branding, including themed login pages.
- **Responsiveness**: Mobile-first design for member-facing pages; desktop-optimized sidebar layout for admin pages.
- **No Client-Side Framework**: Pure server-side rendering is used for simplicity.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ESM modules).
- **View Engine**: EJS templates located in `server/views/`.
- **Static Files**: Served from `server/public/` for CSS, images, and theme assets.
- **Session Management**: `express-session` with `MemoryStore`.
- **Build**: `tsx` for development, `esbuild` for production bundling.

### Data Storage
- **Database**: PostgreSQL, managed with Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts`, encompassing core church entities (members, families, pastors), event management (attendance, RSVPs), engagement features (prayer requests, dues), ministry groups, and content (announcements, notifications, gallery).
- **Multi-tenancy**: Enforced by filtering all database queries by `church_id`.
- **Migrations**: Handled by Drizzle Kit.

### Authentication & Authorization
- **Member Authentication**: Dual login system supporting both password-based and SMS OTP authentication:
  - **Password Login (Primary)**: Members can log in with phone number and password. Admins generate first-time login links for members to set their initial password.
  - **OTP Login (Optional)**: Controlled by `ENABLE_TWILIO_OTP` environment variable (true = enabled for development, false = disabled for production). Uses Twilio Verify API.
- **Admin Authentication**: Email and password using SHA256 hashing.
- **Session Data**: Stores `memberId`, `churchId`, `staffId`, and `isAdmin` flags.
- **Route Protection**: Implemented using `requireMember` and `requireAdmin` middleware.
- **First-Time Login Flow**: Admin generates a secure 48-hour link via POST `/api/admin/members/:id/first-login-link`. Member opens link at `/first-login?token=xxx` to set password.
- **Password Management**: Members can change password at `/change-password` (requires current password).

### Key Design Decisions
- **EJS Server-Side Rendering**: Chosen for simplicity, avoiding client-side JavaScript frameworks. Templates are organized by user role (`admin/`, `member/`) with shared partials.
- **HFNI Themed UI**: Consistent branding across the application, especially on login pages with a distinct hero background.
- **Twilio Verify OTP**: Utilizes the Twilio Verify API for secure, real-time SMS OTPs with built-in rate limiting (60-second cooldown, max 3 requests per 10 minutes). Requires E.164 phone format.
- **Secure Meeting Check-In**: Admins start check-in sessions generating a 6-character alphanumeric code and QR code. Members enter the code at /checkin or scan QR to mark attendance. Codes are SHA256 hashed, valid for 2 hours. Admins can manually add/remove attendees.
- **In-App Notifications**: Replaced many SMS communications to reduce costs, supporting various notification types (announcement, dues reminder, care followup).
- **Dual-Level Dues Tracking**: Supports tracking dues at both family and individual member levels, with dedicated admin interfaces for management and reminders.
- **Two-Way Messaging**: Members can send messages to church staff via /member/messages. Admins can view and respond at /admin/messages. Conversations can be opened/closed by staff.
- **Celebrations Tracking**: Birthday and wedding anniversary dates stored on member records. Admin dashboard shows count when celebrations exist today. Daily scheduled job at 08:00 Europe/London logs celebrations. Detection uses `to_char()` with MM-DD format matching for timezone-safe date comparisons.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe ORM for database interactions.

### Core Libraries
- **express**: Web application framework.
- **express-session**: For session management.
- **ejs**: Template engine.
- **drizzle-orm** / **drizzle-zod**: ORM and Zod integration for schema validation.
- **qrcode**: For generating QR codes.

### APIs & Services
- **Twilio Verify API**: Used for sending and verifying SMS OTPs for member login.
- **Twilio Messages API**: Used for optional SMS broadcasts (e.g., announcements) and follow-ups.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: Secret for session encryption.
- `TWILIO_ACCOUNT_SID`: Twilio Account SID.
- `TWILIO_AUTH_TOKEN` or (`TWILIO_API_KEY` and `TWILIO_API_SECRET`): Twilio authentication credentials.
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify Service SID.
- `TWILIO_FROM_NUMBER`: Twilio phone number for sending SMS messages.
- `ENABLE_TWILIO_OTP`: Optional feature flag to enable OTP-based login (true = enabled, false = disabled). Defaults to true for development.
- `ADMIN_EMAIL`: Optional bootstrap admin email. If set with ADMIN_PASSWORD, ensures an admin account exists on startup.
- `ADMIN_PASSWORD`: Optional bootstrap admin password. Used with ADMIN_EMAIL for guaranteed admin access.

## Deployment Configuration

### Production Build
- **Build Command**: `npm run build` - Bundles server code to `dist/index.cjs`, copies views to `dist/server/views/`, copies public assets to `dist/server/public/`
- **Start Command**: `npm start` - Runs `NODE_ENV=production node dist/index.cjs`
- **Health Check**: `GET /health` returns `OK` with status 200

### Required Production Secrets
Set these in the Replit Secrets tool for the production environment:
- `DATABASE_URL` - Production PostgreSQL connection string
- `SESSION_SECRET` - Secure random string for session encryption
- `ADMIN_EMAIL` - Bootstrap admin email (e.g., admin@hfniconnect.com)
- `ADMIN_PASSWORD` - Bootstrap admin password
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token
- `TWILIO_VERIFY_SERVICE_SID` - Twilio Verify Service SID

### Autoscale Deployment
1. Create new Autoscale deployment in Deployments tool
2. Set Build command: `npm run build`
3. Set Run command: `npm start`
4. Configure production secrets
5. Link custom domain if needed