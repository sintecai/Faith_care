import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import multer from "multer";
import { storage } from "./storage";
import { randomBytes, createHash } from "crypto";
import { verifyAdminPassword } from "./bootstrap-admin";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import { 
  sendVerificationCode, 
  checkVerificationCode, 
  isTwilioConfigured,
  formatToE164,
  normalizePhoneToE164UK,
  isE164,
  validateE164Phone,
  isRateLimited,
  getRateLimitRemaining,
  isMaxOtpExceeded,
  getTwilioClient,
  getVerifyServiceSid,
  getTwilioDiagnostics,
  getAuthMode,
  sendSms
} from "./twilio";
import { followUpTemplates, getTemplateByKey, renderTemplate, duesReminderTemplates, getDuesTemplateByKey, renderDuesTemplate } from "./messageTemplates";

// Get server directory that works in both ESM development and CJS production
function getServerDir(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return path.join(process.cwd(), 'dist', 'server');
  }
  
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return path.join(process.cwd(), 'server');
}

const SERVER_DIR = getServerDir();
const MemoryStoreSession = MemoryStore(session);

declare module "express-session" {
  interface SessionData {
    memberId?: string;
    memberName?: string;
    churchId?: string;
    staffId?: string;
    staffName?: string;
    isAdmin?: boolean;
    pendingPhone?: string;
    pendingEventId?: string;
    pendingToken?: string;
    pendingRememberMe?: boolean;
    lastCheckInCode?: string;
  }
}

function hashPasswordSHA256(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function hashMemberPassword(password: string): string {
  return createHash("sha256").update(password + "hfni-member-salt-2026").digest("hex");
}

function verifyMemberPassword(password: string, hash: string): boolean {
  return hashMemberPassword(password) === hash;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(16).toString("hex");
}

function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

function isOtpEnabled(): boolean {
  const flag = process.env.ENABLE_TWILIO_OTP;
  if (flag === undefined) {
    return process.env.NODE_ENV !== 'production';
  }
  return flag === 'true' || flag === '1';
}

function requireMember(req: Request, res: Response, next: NextFunction) {
  if (!req.session.memberId) {
    const returnUrl = req.originalUrl;
    return res.redirect(`/login?return=${encodeURIComponent(returnUrl)}`);
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.isAdmin) {
    return res.redirect("/admin/login");
  }
  next();
}

// Multer configuration for gallery uploads
const UPLOAD_DIR = path.join(SERVER_DIR, "public", "uploads", "gallery");
// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const galleryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `gallery-${uniqueSuffix}${ext}`);
  }
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and WebP images are allowed'));
    }
  }
});

async function initializeDefaults() {
  try {
    let church = await storage.getFirstChurch();
    if (!church) {
      church = await storage.createChurch({
        name: "St. Mary's Church",
        address: "123 Faith Street",
        phone: "555-0100",
        email: "info@stmarys.org",
      });
      console.log("Created default church:", church.id);
    }

    const adminEmail = "admin@faithcare.local";
    const existingAdmin = await storage.getStaffByEmail(adminEmail, church.id);
    if (!existingAdmin) {
      await storage.createStaffAccount({
        churchId: church.id,
        email: adminEmail,
        passwordHash: hashPasswordSHA256("admin123"),
        name: "Admin User",
        role: "admin",
      });
      console.log("Created default admin: admin@faithcare.local / admin123");
    }

    const pastors = await storage.getPastors(church.id);
    if (pastors.length === 0) {
      await storage.createPastor({
        churchId: church.id,
        name: "Pastor John Smith",
        phone: "555-0101",
        email: "pastor.john@stmarys.org",
      });
      console.log("Created default pastor");
    }

    const units = await storage.getUnits(church.id);
    if (units.length === 0) {
      await storage.createUnit({
        churchId: church.id,
        name: "Youth Ministry",
        description: "Young adults group",
      });
      await storage.createUnit({
        churchId: church.id,
        name: "Choir",
        description: "Music ministry",
      });
      console.log("Created default units");
    }
  } catch (error) {
    console.error("Error initializing defaults:", error);
  }
}

export async function registerRoutes(server: Server, app: Express) {
  // Session configuration with long sessions (7 days default, 90 days with Remember Me)
  const SESSION_DEFAULT_DAYS = 7;
  const SESSION_REMEMBER_DAYS = 90;
  
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "faithcare-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({
        checkPeriod: 86400000 * 7, // Check expired sessions weekly
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production", // true in production with HTTPS
        httpOnly: true,
        sameSite: "lax",
        maxAge: SESSION_DEFAULT_DAYS * 24 * 60 * 60 * 1000, // 7 days default
      },
    })
  );

  // Debug endpoint for cookies/session diagnostics
  app.get("/debug/cookies", (req, res) => {
    res.json({
      nodeEnv: process.env.NODE_ENV || null,
      reqSecure: req.secure,
      xForwardedProto: req.headers["x-forwarded-proto"] || null,
      hasSession: !!req.session,
      cookie: req.session?.cookie ? {
        secure: req.session.cookie.secure,
        sameSite: req.session.cookie.sameSite,
        maxAge: req.session.cookie.maxAge,
      } : null,
    });
  });

  app.get("/debug/session", (req, res) => {
    res.json({
      sessionId: req.sessionID,
      hasCookieHeader: !!req.headers.cookie,
      cookieHeader: req.headers.cookie || null,
      isSecure: req.secure,
      xForwardedProto: req.headers["x-forwarded-proto"] || null,
      sessionKeys: Object.keys(req.session || {}),
      adminId: req.session?.adminId || null,
      memberId: req.session?.memberId || null,
      churchId: req.session?.churchId || null,
      isAdmin: req.session?.isAdmin ?? null,
    });
  });

  app.get("/debug/headers", (req, res) => {
    res.json({
      host: req.headers.host,
      proto: req.protocol,
      secure: req.secure,
      xForwardedProto: req.headers["x-forwarded-proto"] || null,
      allHeaderKeys: Object.keys(req.headers),
    });
  });

  app.set("view engine", "ejs");
  app.set("views", path.join(SERVER_DIR, "views"));
  app.use(express.static(path.join(SERVER_DIR, "public")));

  await initializeDefaults();

  // ============= DEBUG/DIAGNOSTIC ROUTES =============

  // Debug endpoint for Twilio configuration (booleans only - no secrets)
  app.get("/debug/twilio", (_req, res) => {
    res.json({
      accountSid: !!process.env.TWILIO_ACCOUNT_SID,
      authToken: !!process.env.TWILIO_AUTH_TOKEN,
      verifyServiceSid: !!process.env.TWILIO_VERIFY_SERVICE_SID,
      mode: getAuthMode(),
      configured: isTwilioConfigured(),
    });
  });

  // ============= HEALTH CHECK =============
  
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  app.get("/debug/version", (_req, res) => {
    res.json({ ok: true, build: "BUILD_2026_01_11_B", time: new Date().toISOString() });
  });

  // New version endpoint at root level for deployment verification
  app.get("/__version", (_req, res) => {
    res.json({ ok: true, build: "BUILD_2026_01_11_B", time: new Date().toISOString() });
  });

  // ============= API ROUTES =============
  // Basic API ping for production verification
  app.get("/api/__ping", (_req, res) => {
    res.json({ ok: true });
  });

  // API auth check - returns 401 if not authenticated
  app.get("/api/auth/me", (req, res) => {
    if (req.session.memberId) {
      return res.json({ 
        ok: true, 
        type: "member",
        memberId: req.session.memberId,
        churchId: req.session.churchId 
      });
    }
    if (req.session.isAdmin && req.session.staffId) {
      return res.json({ 
        ok: true, 
        type: "admin",
        staffId: req.session.staffId,
        churchId: req.session.churchId 
      });
    }
    return res.status(401).json({ ok: false, error: "NOT_AUTHENTICATED" });
  });

  // ============= ADMIN REDIRECT =============

  // Redirect /admin to /admin/login
  app.get("/admin", (req, res, next) => {
    try {
      if (req.session.isAdmin) {
        return res.redirect("/admin/dashboard");
      }
      res.redirect("/admin/login");
    } catch (err) {
      next(err);
    }
  });

  // ============= MEMBER ROUTES =============

  app.get("/", (req, res) => {
    try {
      if (req.session.memberId) {
        return res.redirect("/home");
      }
      if (req.session.isAdmin) {
        return res.redirect("/admin/dashboard");
      }
      res.redirect("/login");
    } catch (err) {
      console.error("[ERROR] GET / failed:", err);
      res.redirect("/login");
    }
  });

  app.get("/login", async (req, res, next) => {
    try {
      const church = await storage.getFirstChurch();
      res.render("member/login", {
        churchName: church?.name || "HFNI Connect",
        error: req.query.error,
        message: req.query.message,
        eventId: req.query.eventId,
        token: req.query.token,
        otpEnabled: isOtpEnabled(),
      });
    } catch (err) {
      next(err);
    }
  });

  // Member login - send OTP via Twilio Verify API
  // POST /login (also accessible as POST /auth/send-otp)
  // This is the OTP flow - guarded by ENABLE_TWILIO_OTP flag
  app.post("/login", async (req, res, next) => {
    try {
      const { phone, eventId, token } = req.body;
      const church = await storage.getFirstChurch();
      if (!church) {
        return res.render("member/login", { error: "System not configured", churchName: "FaithCare", otpEnabled: isOtpEnabled() });
      }

      // Check if OTP login is enabled
      if (!isOtpEnabled()) {
        return res.render("member/login", {
          churchName: church.name,
          error: "OTP login is disabled. Please use password login.",
          eventId,
          token,
          otpEnabled: false,
        });
      }

      // Validate phone format before anything else
      if (!phone || typeof phone !== 'string') {
        return res.render("member/login", {
          churchName: church.name,
          error: "Phone number is required",
          eventId,
          token,
          otpEnabled: isOtpEnabled(),
        });
      }

      // Normalize to E.164 (handles UK formats: 07..., 0044..., 44..., +44...)
      const formattedPhone = normalizePhoneToE164UK(phone);
      if (!isE164(formattedPhone)) {
        return res.render("member/login", {
          churchName: church.name,
          error: "Please enter a valid UK mobile number",
          eventId,
          token,
        });
      }

      // Check if member exists (but always respond generically for security)
      const member = await storage.getMemberByPhone(formattedPhone, church.id);
      if (!member) {
        return res.render("member/login", {
          churchName: church.name,
          error: "Phone number not registered. Please contact church admin.",
          eventId,
          token,
        });
      }

      // Check Twilio configuration
      if (!isTwilioConfigured()) {
        console.error("[OTP] Twilio not configured");
        return res.render("member/login", {
          churchName: church.name,
          error: "SMS service not configured. Please contact administrator.",
          eventId,
          token,
        });
      }

      // Check rate limiting (60-second cooldown)
      if (isRateLimited(formattedPhone)) {
        const remaining = getRateLimitRemaining(formattedPhone);
        return res.render("member/login", {
          churchName: church.name,
          error: `Please wait ${remaining} seconds before requesting another code.`,
          eventId,
          token,
        });
      }
      
      // Check max OTP limit (3 per 10 minutes)
      if (isMaxOtpExceeded(formattedPhone)) {
        return res.render("member/login", {
          churchName: church.name,
          error: "Too many verification attempts. Please try again in 10 minutes.",
          eventId,
          token,
        });
      }

      // Send OTP via Twilio Verify API (no database storage)
      const result = await sendVerificationCode(formattedPhone);
      
      // Store remember me preference (default true for long sessions)
      const rememberMe = req.body.rememberMe === 'on' || req.body.rememberMe === true;
      
      req.session.pendingPhone = formattedPhone;
      req.session.pendingEventId = eventId;
      req.session.pendingToken = token;
      req.session.pendingRememberMe = rememberMe;

      if (result.success) {
        res.render("member/verify", {
          phone: formattedPhone,
          eventId,
          token,
          rememberMe,
          message: "Verification code sent to your phone via SMS",
        });
      } else {
        console.error("[OTP] Twilio Verify error:", result.error);
        res.render("member/login", {
          churchName: church.name,
          error: result.error || "Failed to send verification code. Please try again.",
          eventId,
          token,
        });
      }
    } catch (err: any) {
      console.error("[OTP] Unexpected error in login handler:", err.message, err.code, err.stack);
      // Don't throw - return clean error to user
      res.render("member/login", {
        churchName: "HFNI Connect",
        error: "Unable to send verification code. Please try again later.",
        eventId: req.body.eventId,
        token: req.body.token,
      });
    }
  });
  
  // Alternative endpoint for API-style access (guarded by OTP flag)
  app.post("/auth/send-otp", async (req, res) => {
    // Check if OTP login is enabled
    if (!isOtpEnabled()) {
      return res.status(403).json({ ok: false, error: "otp_disabled", message: "OTP login is disabled" });
    }
    
    try {
      const { phone } = req.body;
      const church = await storage.getFirstChurch();
      
      if (!church) {
        return res.status(400).json({ ok: false, error: "system_not_configured", message: "Church not set up yet" });
      }

      if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
        return res.status(400).json({ ok: false, error: "phone_required", message: "Please enter your phone number" });
      }

      // Normalize to E.164 (handles UK formats: 07..., 0044..., 44..., +44...)
      const formattedPhone = normalizePhoneToE164UK(phone);
      if (!isE164(formattedPhone)) {
        return res.status(400).json({ ok: false, error: "invalid_phone", message: "Please enter a valid UK mobile number" });
      }

      // Check member exists
      const member = await storage.getMemberByPhone(formattedPhone, church.id);
      if (!member) {
        // Return generic success to prevent phone enumeration
        return res.json({ ok: true, message: "If registered, you will receive an SMS shortly" });
      }

      if (!isTwilioConfigured()) {
        return res.status(400).json({ ok: false, error: "sms_unavailable", message: "SMS service is temporarily unavailable" });
      }

      if (isRateLimited(formattedPhone)) {
        const remaining = getRateLimitRemaining(formattedPhone);
        return res.status(429).json({ ok: false, error: "too_many_requests", message: `Please wait ${remaining} seconds before requesting another code` });
      }

      const result = await sendVerificationCode(formattedPhone);
      
      if (result.success) {
        req.session.pendingPhone = formattedPhone;
        return res.json({ ok: true, message: "Verification code sent to your phone" });
      } else {
        console.error("[OTP API] Twilio error:", result.error);
        return res.status(400).json({ ok: false, error: "send_failed", message: "Could not send code. Please try again." });
      }
    } catch (err: any) {
      console.error("[OTP API] Unexpected error:", err.message, err.code);
      return res.status(400).json({ ok: false, error: "error", message: "Something went wrong. Please try again." });
    }
  });

  // Verify OTP via Twilio Verify API
  // POST /verify (also accessible as POST /auth/verify-otp)
  app.post("/verify", async (req, res, next) => {
    try {
      const { phone, code, eventId, token } = req.body;
      const church = await storage.getFirstChurch();
      if (!church) {
        return res.redirect("/login?error=System not configured");
      }

      // Normalize phone to E.164 (handles UK formats)
      const formattedPhone = normalizePhoneToE164UK(phone);

      // Verify OTP via Twilio Verify API (no database lookup)
      const verifyResult = await checkVerificationCode(formattedPhone, code);

      if (!verifyResult.success) {
        console.error("[VERIFY] Verification failed:", verifyResult.error);
        return res.render("member/verify", {
          phone: formattedPhone,
          eventId,
          token,
          error: verifyResult.error || "Invalid or expired code. Please try again.",
        });
      }

      // Get member for session
      const member = await storage.getMemberByPhone(formattedPhone, church.id);
      if (!member) {
        return res.redirect("/login?error=Member not found");
      }

      // Create login session
      req.session.memberId = member.id;
      req.session.memberName = `${member.firstName} ${member.lastName}`;
      req.session.churchId = church.id;
      
      console.log("[LOGIN] Member session set:", { memberId: req.session.memberId, churchId: req.session.churchId });
      
      // Extend session if Remember Me was checked (90 days instead of 7 days)
      const rememberMe = req.session.pendingRememberMe;
      if (rememberMe && req.session.cookie) {
        const SESSION_REMEMBER_DAYS = 90;
        req.session.cookie.maxAge = SESSION_REMEMBER_DAYS * 24 * 60 * 60 * 1000;
      }

      // Clear pending session data
      delete req.session.pendingPhone;
      delete req.session.pendingEventId;
      delete req.session.pendingToken;
      delete req.session.pendingRememberMe;
      
      // Save session with updated maxAge before redirect
      req.session.save((err) => {
        if (err) {
          console.error("[LOGIN] Session save error:", err);
        }
        console.log("[LOGIN] Member session saved, redirecting...");
        if (eventId && token) {
          return res.redirect(`/attendance/confirm?eventId=${eventId}&token=${token}`);
        }
        res.redirect("/home");
      });
    } catch (err: any) {
      console.error("[VERIFY] Unexpected error:", err.message, err.stack);
      res.redirect("/login?error=Verification failed");
    }
  });
  
  // Alternative API endpoint for OTP verification
  app.post("/auth/verify-otp", async (req, res) => {
    const { phone, code } = req.body;
    const church = await storage.getFirstChurch();
    
    if (!church) {
      return res.status(400).json({ ok: false, error: "system_not_configured", message: "Church not set up yet" });
    }

    const formattedPhone = normalizePhoneToE164UK(phone);
    if (!isE164(formattedPhone)) {
      return res.status(400).json({ ok: false, error: "invalid_phone", message: "Please enter a valid UK mobile number" });
    }

    const verifyResult = await checkVerificationCode(formattedPhone, code);

    if (!verifyResult.success) {
      return res.status(401).json({ success: false, error: verifyResult.error || "Invalid code" });
    }

    const member = await storage.getMemberByPhone(formattedPhone, church.id);
    if (!member) {
      return res.status(404).json({ success: false, error: "Member not found" });
    }

    // Create login session
    req.session.memberId = member.id;
    req.session.memberName = `${member.firstName} ${member.lastName}`;
    req.session.churchId = church.id;

    console.log("[LOGIN API] Member session set:", { memberId: req.session.memberId, churchId: req.session.churchId });

    // Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
      }
      console.log("[LOGIN API] Member session saved");
      return res.json({ 
        success: true, 
        message: "Login successful",
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`
      });
    });
  });

  // ============= PASSWORD LOGIN ROUTES =============

  // Password-based login (primary for production when OTP is disabled)
  app.post("/auth/password-login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      const church = await storage.getFirstChurch();
      
      if (!church) {
        return res.status(400).json({ ok: false, error: "system_not_configured", message: "Church not set up yet" });
      }

      if (!phone || !password) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "Phone and password are required" });
      }

      // Normalize phone
      const formattedPhone = normalizePhoneToE164UK(phone);
      if (!isE164(formattedPhone)) {
        return res.status(400).json({ ok: false, error: "invalid_phone", message: "Please enter a valid UK mobile number" });
      }

      // Find member
      const member = await storage.getMemberByPhone(formattedPhone, church.id);
      if (!member) {
        return res.status(401).json({ ok: false, error: "invalid_credentials", message: "Invalid phone or password" });
      }

      // Check if member has a password set
      if (!member.passwordHash) {
        return res.status(401).json({ 
          ok: false, 
          error: "no_password", 
          message: "Password not set. Use the first-time login link or contact admin." 
        });
      }

      // Verify password
      if (!verifyMemberPassword(password, member.passwordHash)) {
        return res.status(401).json({ ok: false, error: "invalid_credentials", message: "Invalid phone or password" });
      }

      // Create login session
      req.session.memberId = member.id;
      req.session.memberName = `${member.firstName} ${member.lastName}`;
      req.session.churchId = church.id;

      console.log("[PASSWORD LOGIN] Member session set:", { memberId: req.session.memberId, churchId: req.session.churchId });

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        }
        return res.json({ 
          ok: true, 
          message: "Login successful",
          redirect: "/home"
        });
      });
    } catch (err: any) {
      console.error("[PASSWORD LOGIN] Error:", err.message);
      return res.status(500).json({ ok: false, error: "server_error", message: "Login failed. Please try again." });
    }
  });

  // First-time login page (set password)
  app.get("/first-login", async (req, res) => {
    const token = req.query.token as string;
    const church = await storage.getFirstChurch();
    
    if (!token) {
      return res.render("member/first-login", { 
        churchName: church?.name || "HFNI Connect",
        error: "Invalid or missing login link",
        tokenValid: false 
      });
    }

    // Hash token and find member
    const tokenHash = hashToken(token);
    const member = await storage.getMemberByFirstLoginToken(tokenHash);
    
    if (!member) {
      return res.render("member/first-login", { 
        churchName: church?.name || "HFNI Connect",
        error: "Invalid or expired login link",
        tokenValid: false 
      });
    }

    // Check expiry
    if (member.firstLoginExpiresAt && new Date(member.firstLoginExpiresAt) < new Date()) {
      return res.render("member/first-login", { 
        churchName: church?.name || "HFNI Connect",
        error: "Login link has expired. Please contact admin for a new link.",
        tokenValid: false 
      });
    }

    res.render("member/first-login", { 
      churchName: church?.name || "HFNI Connect",
      memberName: `${member.firstName} ${member.lastName}`,
      token,
      tokenValid: true 
    });
  });

  // Set password from first-login link
  app.post("/auth/first-login/set-password", async (req, res) => {
    try {
      const { token, password, confirmPassword } = req.body;
      const church = await storage.getFirstChurch();

      if (!token || !password || !confirmPassword) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "All fields are required" });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ ok: false, error: "password_mismatch", message: "Passwords do not match" });
      }

      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: "weak_password", message: "Password must be at least 6 characters" });
      }

      // Hash token and find member
      const tokenHash = hashToken(token);
      const member = await storage.getMemberByFirstLoginToken(tokenHash);

      if (!member) {
        return res.status(400).json({ ok: false, error: "invalid_token", message: "Invalid or expired login link" });
      }

      // Check expiry
      if (member.firstLoginExpiresAt && new Date(member.firstLoginExpiresAt) < new Date()) {
        return res.status(400).json({ ok: false, error: "expired_token", message: "Login link has expired" });
      }

      // Set password and clear token
      const passwordHash = hashMemberPassword(password);
      await storage.updateMemberPasswordFields(member.id, member.churchId, {
        passwordHash,
        firstLoginTokenHash: null,
        firstLoginExpiresAt: null,
      });

      // Create login session
      req.session.memberId = member.id;
      req.session.memberName = `${member.firstName} ${member.lastName}`;
      req.session.churchId = member.churchId;

      console.log("[FIRST LOGIN] Member password set, session created:", { memberId: member.id });

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        }
        return res.json({ ok: true, message: "Password set successfully", redirect: "/home" });
      });
    } catch (err: any) {
      console.error("[FIRST LOGIN] Error:", err.message);
      return res.status(500).json({ ok: false, error: "server_error", message: "Failed to set password" });
    }
  });

  // Member change password page
  app.get("/change-password", requireMember, async (req, res) => {
    const church = await storage.getChurch(req.session.churchId!);
    res.render("member/change-password", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      message: req.query.message,
      error: req.query.error,
    });
  });

  // Member change password API
  app.post("/auth/change-password", requireMember, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const memberId = req.session.memberId!;
      const churchId = req.session.churchId!;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "All fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ ok: false, error: "password_mismatch", message: "Passwords do not match" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, error: "weak_password", message: "Password must be at least 6 characters" });
      }

      const member = await storage.getMember(memberId, churchId);
      if (!member) {
        return res.status(404).json({ ok: false, error: "member_not_found", message: "Member not found" });
      }

      // Verify current password
      if (!member.passwordHash || !verifyMemberPassword(currentPassword, member.passwordHash)) {
        return res.status(401).json({ ok: false, error: "invalid_password", message: "Current password is incorrect" });
      }

      // Set new password
      const passwordHash = hashMemberPassword(newPassword);
      await storage.updateMemberPasswordFields(memberId, churchId, { passwordHash });

      console.log("[CHANGE PASSWORD] Member password updated:", { memberId });

      return res.json({ ok: true, message: "Password changed successfully" });
    } catch (err: any) {
      console.error("[CHANGE PASSWORD] Error:", err.message);
      return res.status(500).json({ ok: false, error: "server_error", message: "Failed to change password" });
    }
  });

  app.get("/home", requireMember, async (req, res, next) => {
    try {
      const church = await storage.getChurch(req.session.churchId!);
      const activeMeetings = await storage.getActiveMeetings(req.session.churchId!);
      const activeMeeting = activeMeetings.length > 0 ? activeMeetings[0] : null;
      const allEvents = await storage.getMassEvents(req.session.churchId!);
      const now = new Date();
      const upcomingEvents = allEvents
        .filter(e => new Date(e.eventDate) >= now)
        .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
        .slice(0, 5);

      res.render("member/home", {
        churchName: church?.name || "HFNI Connect",
        memberName: req.session.memberName,
        activeMeeting,
        upcomingEvents,
        message: req.query.message,
        error: req.query.error,
      });
    } catch (err) {
      next(err);
    }
  });

  // Member Rides/Carpooling page
  app.get("/rides", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const church = await storage.getChurch(churchId);
    
    // Get upcoming events for meeting selection
    const allEvents = await storage.getMassEvents(churchId);
    const now = new Date();
    const upcomingEvents = allEvents
      .filter(e => new Date(e.eventDate) >= now)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
      .slice(0, 10);
    
    // Default to first upcoming event
    const selectedMeetingId = (req.query.meeting as string) || (upcomingEvents[0]?.id || '');
    const selectedMeeting = upcomingEvents.find(e => e.id === selectedMeetingId);
    const meetingTitle = selectedMeeting?.title || 'Meeting';
    
    // Get ride offers and requests for selected meeting
    let rideOffers: Awaited<ReturnType<typeof storage.getRideOffers>> = [];
    let rideRequests: Awaited<ReturnType<typeof storage.getRideRequests>> = [];
    if (selectedMeetingId) {
      rideOffers = await storage.getRideOffers(selectedMeetingId, churchId);
      rideRequests = await storage.getRideRequests(selectedMeetingId, churchId);
    }
    
    // Add meeting title to all offers and requests
    const offersWithMeeting = rideOffers.map(o => ({ ...o, meetingTitle }));
    const requestsWithMeeting = rideRequests.map(r => ({ ...r, meetingTitle }));
    
    // Filter to get member's own offers/requests (only show open ones)
    const myOffers = offersWithMeeting.filter(o => o.memberId === memberId && o.status === 'open');
    const myRequests = requestsWithMeeting.filter(r => r.requesterId === memberId);
    const availableOffers = offersWithMeeting.filter(o => o.memberId !== memberId && o.status === 'open');
    // Show ride requests from others (not current member) to potential drivers
    const otherRequests = requestsWithMeeting.filter(r => r.requesterId !== memberId && r.status === 'pending');
    
    res.render("member/rides", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      upcomingEvents,
      selectedMeetingId,
      availableOffers,
      myOffers,
      myRequests,
      rideRequests: otherRequests,
      message: req.query.message,
      error: req.query.error,
    });
  });
  
  // POST: Offer a ride
  app.post("/rides/offer", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const { meetingId, pickupArea, seatsAvailable, vehicleType, notes } = req.body;
    
    if (!meetingId || !pickupArea) {
      return res.redirect("/rides?error=" + encodeURIComponent("Please select a meeting and enter pickup location"));
    }
    
    // Combine vehicle type with notes
    const fullNotes = vehicleType ? `Vehicle: ${vehicleType}${notes ? '. ' + notes : ''}` : (notes || null);
    
    await storage.createRideOffer({
      churchId,
      meetingId,
      memberId,
      pickupArea,
      seatsAvailable: parseInt(seatsAvailable) || 1,
      notes: fullNotes,
    });
    
    res.redirect("/rides?meeting=" + meetingId + "&message=" + encodeURIComponent("Ride offer created successfully!"));
  });
  
  // POST: Cancel a ride offer
  app.post("/rides/offer/:id/cancel", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const offerId = req.params.id;
    
    const offer = await storage.getRideOffer(offerId, churchId);
    if (!offer || offer.memberId !== memberId) {
      return res.redirect("/rides?error=" + encodeURIComponent("Ride offer not found"));
    }
    
    await storage.updateRideOffer(offerId, churchId, { status: 'closed' });
    res.redirect("/rides?message=" + encodeURIComponent("Ride offer cancelled"));
  });
  
  // POST: Request a ride
  app.post("/rides/request", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const { meetingId, pickupArea, preferredTime, notes } = req.body;
    
    if (!meetingId || !pickupArea) {
      return res.redirect("/rides?error=" + encodeURIComponent("Please select a meeting and enter pickup location"));
    }
    
    // Combine preferred time with notes
    const fullNotes = preferredTime ? `Preferred pickup: ${preferredTime}${notes ? '. ' + notes : ''}` : (notes || null);
    
    await storage.createRideRequest({
      churchId,
      meetingId,
      requesterId: memberId,
      pickupArea,
      notes: fullNotes,
    });
    
    res.redirect("/rides?meeting=" + meetingId + "&message=" + encodeURIComponent("Ride request submitted successfully!"));
  });
  
  // POST: Cancel a ride request
  app.post("/rides/request/:id/cancel", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const requestId = req.params.id;
    
    const request = await storage.getRideRequest(requestId, churchId);
    if (!request || request.requesterId !== memberId) {
      return res.redirect("/rides?error=" + encodeURIComponent("Ride request not found"));
    }
    
    await storage.deleteRideRequest(requestId, churchId);
    res.redirect("/rides?message=" + encodeURIComponent("Ride request cancelled"));
  });
  
  // GET: Message a member from carpooling (shows contact info)
  app.get("/rides/message/:targetMemberId", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const targetMemberId = req.params.targetMemberId;
    
    if (targetMemberId === memberId) {
      return res.redirect("/rides?error=" + encodeURIComponent("You cannot message yourself"));
    }
    
    try {
      // Get target member info
      const targetMember = await storage.getMember(targetMemberId, churchId);
      if (!targetMember) {
        return res.redirect("/rides?error=" + encodeURIComponent("Member not found"));
      }
      
      // Since the messaging system is member-to-staff, we'll redirect to messages 
      // with a pre-filled context asking staff to help connect the members
      // This is a workaround until member-to-member messaging is implemented
      const contactName = `${targetMember.firstName} ${targetMember.lastName}`;
      const message = `I would like to connect with ${contactName} regarding carpooling. Please help us get in touch.`;
      
      res.redirect("/member/messages?action=new&prefill=" + encodeURIComponent(message));
    } catch (error) {
      console.error("Error in rides/message:", error);
      return res.redirect("/rides?error=" + encodeURIComponent("Unable to start conversation"));
    }
  });

  // Member Calendar page
  app.get("/calendar", requireMember, async (req, res) => {
    const church = await storage.getChurch(req.session.churchId!);
    const allEvents = await storage.getMassEvents(req.session.churchId!);
    const now = new Date();
    const upcomingEvents = allEvents
      .filter(e => new Date(e.eventDate) >= now)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    
    res.render("member/calendar", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      events: upcomingEvents,
      message: req.query.message,
      error: req.query.error,
    });
  });

  // Member Groups page
  app.get("/groups", requireMember, async (req, res) => {
    const church = await storage.getChurch(req.session.churchId!);
    const memberId = req.session.memberId!;
    const churchId = req.session.churchId!;
    const memberGroups = await storage.getGroupsForMember(memberId, churchId);
    
    res.render("member/groups", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      groups: memberGroups,
      message: req.query.message,
      error: req.query.error,
    });
  });

  // Member Volunteer page
  app.get("/volunteer", requireMember, async (req, res) => {
    const church = await storage.getChurch(req.session.churchId!);
    res.render("member/volunteer", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      message: req.query.message,
      error: req.query.error,
    });
  });

  // Member - Announcements
  app.get("/announcements", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const church = await storage.getChurch(churchId);
    const allAnnouncements = await storage.getAnnouncements(churchId);
    const announcements = allAnnouncements.map(a => ({
      ...a,
      content: a.body,
      isUrgent: a.priority === 'urgent',
      publishDate: a.createdAt,
    }));
    res.render("member/announcements", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      announcements,
    });
  });

  // Member - Notifications
  app.get("/notifications", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const church = await storage.getChurch(churchId);
    // Get notifications for this member (personal + general announcements)
    const memberNotifications = await storage.getNotificationsForMember(memberId, churchId);
    const notifications = memberNotifications.map(n => ({
      ...n,
      message: n.body,
      typeLabel: n.type === 'announcement' ? 'Announcement' : 
                 n.type === 'dues_reminder' ? 'Reminder' : 
                 n.type === 'care_followup' ? 'Follow-up' : 'General',
    }));
    res.render("member/notifications", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      notifications,
    });
  });

  app.post("/notifications/:id/read", requireMember, async (req, res) => {
    const memberId = req.session.memberId!;
    await storage.markNotificationRead(req.params.id, memberId);
    res.redirect("/notifications");
  });

  // ============= MEMBER MESSAGES =============
  
  app.get("/member/messages", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const church = await storage.getChurch(churchId);
    
    const memberConversations = await storage.getConversationsForMember(memberId, churchId);
    const conversations = await Promise.all(memberConversations.map(async (conv) => {
      const latestMsg = await storage.getLatestMessageForConversation(conv.id);
      return {
        ...conv,
        lastMessage: latestMsg?.body,
      };
    }));
    
    res.render("member/messages", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      conversations,
      message: req.query.message,
      error: req.query.error,
    });
  });
  
  app.post("/member/messages/new", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const { subject, body } = req.body;
    
    if (!subject || !body) {
      return res.redirect("/member/messages?error=Subject and message are required");
    }
    
    // Create conversation
    const conversation = await storage.createConversation({
      churchId,
      memberId,
      subject,
    });
    
    // Create first message
    await storage.createMessage({
      churchId,
      conversationId: conversation.id,
      senderType: 'member',
      senderMemberId: memberId,
      body,
    });
    
    res.redirect(`/member/messages/${conversation.id}?message=Message sent successfully`);
  });
  
  app.get("/member/messages/:id", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const church = await storage.getChurch(churchId);
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/member/messages?error=Conversation not found");
    }
    
    // Check member owns this conversation
    if (conversation.memberId !== memberId) {
      return res.redirect("/member/messages?error=Access denied");
    }
    
    const messages = await storage.getMessagesForConversation(conversation.id, churchId);
    
    res.render("member/message-detail", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      conversation,
      messages,
      error: req.query.error,
    });
  });
  
  app.post("/member/messages/:id/reply", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    const { body } = req.body;
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/member/messages?error=Conversation not found");
    }
    
    // Check member owns this conversation
    if (conversation.memberId !== memberId) {
      return res.redirect("/member/messages?error=Access denied");
    }
    
    if (conversation.status !== 'open') {
      return res.redirect(`/member/messages/${req.params.id}?error=This conversation is closed`);
    }
    
    if (!body || !body.trim()) {
      return res.redirect(`/member/messages/${req.params.id}?error=Message cannot be empty`);
    }
    
    await storage.createMessage({
      churchId,
      conversationId: conversation.id,
      senderType: 'member',
      senderMemberId: memberId,
      body: body.trim(),
    });
    
    res.redirect(`/member/messages/${req.params.id}`);
  });

  // Member - Gallery
  app.get("/gallery", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const church = await storage.getChurch(churchId);
    const allItems = await storage.getGalleryItems(churchId);
    const galleryItems = allItems.filter(item => item.isActive !== false).map(item => ({
      ...item,
      type: item.mediaType === 'video' ? 'video' : 'image',
      description: null,
    }));
    res.render("member/gallery", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      galleryItems,
    });
  });

  // Member - Testimonies
  app.get("/testimonies", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const church = await storage.getChurch(churchId);
    const approvedTestimonies = await storage.getTestimonies(churchId, 'approved');
    const testimonies = await Promise.all(approvedTestimonies.map(async t => {
      let memberName = null;
      if (t.memberId) {
        const member = await storage.getMember(t.memberId, churchId);
        memberName = member ? `${member.firstName} ${member.lastName}` : null;
      }
      return { ...t, memberName };
    }));
    res.render("member/testimonies", {
      churchName: church?.name || "HFNI Connect",
      memberName: req.session.memberName,
      testimonies,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.post("/testimonies/submit", requireMember, async (req, res) => {
    const { title, content, anonymous } = req.body;
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    try {
      await storage.createTestimony({
        churchId,
        memberId,
        title,
        body: content,
        status: 'pending',
      });
      res.redirect("/testimonies?message=Thank you for sharing! Your testimony is pending review.");
    } catch (error) {
      console.error("Error submitting testimony:", error);
      res.redirect("/testimonies?error=Failed to submit testimony. Please try again.");
    }
  });

  app.get("/attendance/confirm", requireMember, async (req, res) => {
    const { eventId } = req.query;
    const church = await storage.getChurch(req.session.churchId!);

    if (!eventId) {
      return res.render("member/attendance-confirm", {
        churchName: church?.name,
        memberName: req.session.memberName,
        success: false,
        error: "No event specified",
      });
    }

    const event = await storage.getMassEvent(eventId as string, req.session.churchId!);
    if (!event) {
      return res.render("member/attendance-confirm", {
        churchName: church?.name,
        memberName: req.session.memberName,
        success: false,
        error: "Event not found",
      });
    }

    if (!event.attendanceOpen) {
      return res.render("member/attendance-confirm", {
        churchName: church?.name,
        memberName: req.session.memberName,
        success: false,
        error: "Attendance is not open for this event",
      });
    }

    const existing = await storage.getAttendanceByMemberAndEvent(
      req.session.memberId!,
      event.id,
      req.session.churchId!
    );
    if (existing) {
      return res.render("member/attendance-confirm", {
        churchName: church?.name,
        memberName: req.session.memberName,
        success: true,
        eventTitle: event.title,
        message: "Your attendance was already recorded",
      });
    }

    await storage.createAttendance({
      churchId: req.session.churchId!,
      eventId: event.id,
      memberId: req.session.memberId!,
    });

    res.render("member/attendance-confirm", {
      churchName: church?.name,
      memberName: req.session.memberName,
      success: true,
      eventTitle: event.title,
    });
  });

  app.get("/prayer-request", requireMember, async (req, res) => {
    const church = await storage.getChurch(req.session.churchId!);
    const member = await storage.getMember(req.session.memberId!, req.session.churchId!);
    const pastors = await storage.getPastors(req.session.churchId!);
    let unitName = "";
    if (member?.unitId) {
      const unit = await storage.getUnit(member.unitId, req.session.churchId!);
      unitName = unit?.name || "";
    }

    res.render("member/prayer-request", {
      churchName: church?.name,
      memberName: req.session.memberName,
      unitName,
      pastors,
      error: req.query.error,
      success: req.query.success,
    });
  });

  app.post("/prayer-request", requireMember, async (req, res) => {
    const { requestText, pastorId } = req.body;
    const member = await storage.getMember(req.session.memberId!, req.session.churchId!);

    if (!requestText || requestText.trim().length < 10) {
      return res.redirect("/prayer-request?error=Please provide a detailed prayer request");
    }

    let selectedPastorId = pastorId;
    if (!selectedPastorId) {
      const pastors = await storage.getPastors(req.session.churchId!);
      if (pastors.length === 1) {
        selectedPastorId = pastors[0].id;
      }
    }

    await storage.createPrayerRequest({
      churchId: req.session.churchId!,
      memberId: req.session.memberId!,
      pastorId: selectedPastorId || null,
      unitId: member?.unitId || null,
      requestText: requestText.trim(),
      status: "new",
    });

    res.redirect("/home?message=Prayer request submitted successfully");
  });

  app.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  // ============= ADMIN ROUTES =============

  app.get("/admin/login", (req, res, next) => {
    try {
      if (req.session.isAdmin) {
        return res.redirect("/admin/dashboard");
      }
      res.render("admin/login", { error: req.query.error });
    } catch (err) {
      next(err);
    }
  });

  app.post("/admin/login", async (req, res) => {
    const { email, password } = req.body;
    const church = await storage.getFirstChurch();
    if (!church) {
      return res.render("admin/login", { error: "System not configured" });
    }

    const staff = await storage.getStaffByEmail(email, church.id);
    if (!staff) {
      return res.render("admin/login", { error: "Invalid email or password" });
    }
    
    const passwordValid = await verifyAdminPassword(password, staff.passwordHash);
    if (!passwordValid) {
      return res.render("admin/login", { error: "Invalid email or password" });
    }

    req.session.staffId = staff.id;
    req.session.staffName = staff.name;
    req.session.churchId = church.id;
    req.session.isAdmin = true;

    console.log("[LOGIN] Admin session set:", { staffId: req.session.staffId, isAdmin: req.session.isAdmin, churchId: req.session.churchId });

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error("Admin session save error:", err);
      }
      console.log("[LOGIN] Admin session saved, redirecting to /admin/dashboard");
      res.redirect("/admin/dashboard");
    });
  });

  // Helper: get today's date in Europe/London timezone as MM-DD
  function getTodayMonthDay(): string {
    const now = new Date();
    // Convert to Europe/London timezone
    const londonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    const month = String(londonTime.getMonth() + 1).padStart(2, '0');
    const day = String(londonTime.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }
  
  // Helper: format today's date for display
  function getTodayFormatted(): string {
    const now = new Date();
    const londonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    return londonTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  app.get("/admin/dashboard", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;

    const totalMembers = await storage.getMemberCount(churchId);
    const activeMembers = await storage.getActiveMemberCount(churchId);
    const prayerCounts = await storage.getPrayerRequestCounts(churchId);
    const duesSoon = (await storage.getFamiliesWithDuesDue(churchId, 7)).length;
    const duesOverdue = (await storage.getFamiliesWithOverdueDues(churchId)).length;

    const events = await storage.getMassEvents(churchId);
    let latestAttendance = 0;
    let attendancePercent = 0;
    if (events.length > 0) {
      latestAttendance = await storage.getAttendanceCount(events[0].id, churchId);
      attendancePercent = activeMembers > 0 ? Math.round((latestAttendance / activeMembers) * 100) : 0;
    }
    
    // Get today's celebrations
    const monthDay = getTodayMonthDay();
    const celebrations = await storage.getMembersWithCelebrationsToday(churchId, monthDay);
    const celebrationCount = celebrations.birthdays.length + celebrations.anniversaries.length;

    res.render("admin/dashboard", {
      staffName: req.session.staffName,
      totalMembers,
      activeMembers,
      latestAttendance,
      attendancePercent,
      prayerCounts,
      duesSoon,
      duesOverdue,
      celebrationCount,
    });
  });
  
  // Celebrations page
  app.get("/admin/celebrations", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const monthDay = getTodayMonthDay();
    const todayFormatted = getTodayFormatted();
    const celebrations = await storage.getMembersWithCelebrationsToday(churchId, monthDay);
    
    res.render("admin/celebrations", {
      staffName: req.session.staffName,
      todayFormatted,
      birthdays: celebrations.birthdays,
      anniversaries: celebrations.anniversaries,
    });
  });

  // ============= MEMBERS CRUD =============

  app.get("/admin/members", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const query = req.query.q as string | undefined;
    const units = await storage.getUnits(churchId);

    let members;
    if (query) {
      members = await storage.searchMembers(churchId, query);
    } else {
      members = await storage.getMembers(churchId);
    }

    const membersWithUnits = members.map((m) => {
      const unit = units.find((u) => u.id === m.unitId);
      return { ...m, unitName: unit?.name };
    });

    res.render("admin/members", {
      staffName: req.session.staffName,
      members: membersWithUnits,
      query,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/members/new", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const units = await storage.getUnits(churchId);
    const families = await storage.getFamilies(churchId);
    res.render("admin/member-form", {
      staffName: req.session.staffName,
      isEdit: false,
      member: null,
      units,
      families,
      error: req.query.error,
    });
  });

  app.post("/admin/members/new", requireAdmin, async (req, res) => {
    const { firstName, lastName, phone, email, unitId, smsConsent, addressLine1, addressLine2, city, county, postcode, country, duesIsEnabled, duesAmount, duesFrequency, dateOfBirth, weddingAnniversary } = req.body;
    const churchId = req.session.churchId!;

    const existing = await storage.getMemberByPhone(phone, churchId);
    if (existing) {
      const units = await storage.getUnits(churchId);
      const families = await storage.getFamilies(churchId);
      return res.render("admin/member-form", {
        staffName: req.session.staffName,
        isEdit: false,
        member: { firstName, lastName, phone, email, unitId, addressLine1, addressLine2, city, county, postcode, country, duesIsEnabled, duesAmount, duesFrequency, dateOfBirth, weddingAnniversary },
        units,
        families,
        error: "A member with this phone number already exists",
      });
    }

    await storage.createMember({
      churchId,
      firstName,
      lastName,
      phone,
      email: email || null,
      unitId: unitId || null,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      county: county || null,
      postcode: postcode || null,
      country: country || "UK",
      smsConsent: smsConsent === "on",
      duesIsEnabled: duesIsEnabled === "on",
      duesAmount: duesAmount || null,
      duesFrequency: duesFrequency || "monthly",
      dateOfBirth: dateOfBirth || null,
      weddingAnniversary: weddingAnniversary || null,
    });

    res.redirect("/admin/members?message=Member created successfully");
  });

  app.get("/admin/members/:id/edit", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const member = await storage.getMember(req.params.id, churchId);
    if (!member) {
      return res.redirect("/admin/members?error=Member not found");
    }
    const units = await storage.getUnits(churchId);
    const families = await storage.getFamilies(churchId);
    res.render("admin/member-form", {
      staffName: req.session.staffName,
      isEdit: true,
      member,
      units,
      families,
      error: req.query.error,
    });
  });

  app.post("/admin/members/:id/edit", requireAdmin, async (req, res) => {
    const { firstName, lastName, phone, email, unitId, smsConsent, isActive, addressLine1, addressLine2, city, county, postcode, country, duesIsEnabled, duesAmount, duesFrequency, dateOfBirth, weddingAnniversary } = req.body;
    await storage.updateMember(req.params.id, req.session.churchId!, {
      firstName,
      lastName,
      phone,
      email: email || null,
      unitId: unitId || null,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      county: county || null,
      postcode: postcode || null,
      country: country || "UK",
      smsConsent: smsConsent === "on",
      isActive: isActive === "on",
      duesIsEnabled: duesIsEnabled === "on",
      duesAmount: duesAmount || null,
      duesFrequency: duesFrequency || "monthly",
      dateOfBirth: dateOfBirth || null,
      weddingAnniversary: weddingAnniversary || null,
    });
    res.redirect("/admin/members?message=Member updated successfully");
  });

  app.post("/admin/members/:id/delete", requireAdmin, async (req, res) => {
    await storage.deleteMember(req.params.id, req.session.churchId!);
    res.redirect("/admin/members?message=Member deleted successfully");
  });

  // Generate first-time login link for member
  app.post("/api/admin/members/:id/first-login-link", requireAdmin, async (req, res) => {
    try {
      const memberId = req.params.id;
      const churchId = req.session.churchId!;
      
      const member = await storage.getMember(memberId, churchId);
      if (!member) {
        return res.status(404).json({ ok: false, error: "member_not_found", message: "Member not found" });
      }

      // Generate secure token (32 bytes = 64 hex chars)
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      // Store hashed token
      await storage.updateMemberPasswordFields(memberId, churchId, {
        firstLoginTokenHash: tokenHash,
        firstLoginExpiresAt: expiresAt,
      });

      // Build link (use host from request)
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = req.get('host');
      const link = `${protocol}://${host}/first-login?token=${rawToken}`;

      return res.json({
        ok: true,
        link,
        expiresAt: expiresAt.toISOString(),
        memberName: `${member.firstName} ${member.lastName}`,
      });
    } catch (err: any) {
      console.error("[FIRST-LOGIN-LINK] Error:", err.message);
      return res.status(500).json({ ok: false, error: "server_error", message: "Failed to generate link" });
    }
  });

  // ============= CHURCHES CRUD =============

  app.get("/admin/churches", requireAdmin, async (req, res) => {
    const churches = await storage.getChurches();
    res.render("admin/churches", {
      staffName: req.session.staffName,
      churches,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/churches/new", requireAdmin, (req, res) => {
    res.render("admin/church-form", {
      staffName: req.session.staffName,
      isEdit: false,
      church: null,
      error: req.query.error,
    });
  });

  app.post("/admin/churches/new", requireAdmin, async (req, res) => {
    try {
      const { name, address, phone, email } = req.body;
      await storage.createChurch({
        name,
        address: address || null,
        phone: phone || null,
        email: email || null,
      });
      res.redirect("/admin/churches?message=Church created successfully");
    } catch (error) {
      console.error("Error creating church:", error);
      res.redirect("/admin/churches/new?error=Failed to create church");
    }
  });

  app.get("/admin/churches/:id/edit", requireAdmin, async (req, res) => {
    try {
      const church = await storage.getChurch(req.params.id);
      if (!church) {
        return res.redirect("/admin/churches?error=Church not found");
      }
      res.render("admin/church-form", {
        staffName: req.session.staffName,
        isEdit: true,
        church,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading church:", error);
      res.redirect("/admin/churches?error=Failed to load church");
    }
  });

  app.post("/admin/churches/:id/edit", requireAdmin, async (req, res) => {
    try {
      const { name, address, phone, email } = req.body;
      await storage.updateChurch(req.params.id, {
        name,
        address: address || null,
        phone: phone || null,
        email: email || null,
      });
      res.redirect("/admin/churches?message=Church updated successfully");
    } catch (error) {
      console.error("Error updating church:", error);
      res.redirect(`/admin/churches/${req.params.id}/edit?error=Failed to update church`);
    }
  });

  app.post("/admin/churches/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteChurch(req.params.id);
      res.redirect("/admin/churches?message=Church deleted successfully");
    } catch (error) {
      console.error("Error deleting church:", error);
      res.redirect("/admin/churches?error=Failed to delete church. It may have related records.");
    }
  });

  // ============= FAMILIES CRUD =============

  app.get("/admin/families", requireAdmin, async (req, res) => {
    const families = await storage.getFamilies(req.session.churchId!);
    res.render("admin/families", {
      staffName: req.session.staffName,
      families,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/families/new", requireAdmin, async (req, res) => {
    const units = await storage.getUnits(req.session.churchId!);
    res.render("admin/family-form", {
      staffName: req.session.staffName,
      isEdit: false,
      family: null,
      units: units.filter(u => u.isActive),
      error: req.query.error,
    });
  });

  app.post("/admin/families/new", requireAdmin, async (req, res) => {
    try {
      const { name, unitId, dueAmount, dueFrequency, nextDueDate, dueNotes, addressLine1, addressLine2, city, county, postcode, country, contactPhone, contactName } = req.body;
      
      // Validate E.164 phone format if provided
      if (contactPhone && !contactPhone.startsWith('+')) {
        return res.redirect("/admin/families/new?error=Contact phone must be in E.164 format (start with +)");
      }
      
      await storage.createFamily({
        churchId: req.session.churchId!,
        name,
        unitId: unitId || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        county: county || null,
        postcode: postcode || null,
        country: country || "UK",
        dueAmount: dueAmount || null,
        dueFrequency: dueFrequency || "monthly",
        nextDueDate: nextDueDate || null,
        dueNotes: dueNotes || null,
        contactPhone: contactPhone || null,
        contactName: contactName || null,
      });
      res.redirect("/admin/families?message=Family created successfully");
    } catch (error) {
      console.error("Error creating family:", error);
      res.redirect("/admin/families/new?error=Failed to create family");
    }
  });

  app.get("/admin/families/:id/edit", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const family = await storage.getFamily(req.params.id, churchId);
      if (!family) {
        return res.redirect("/admin/families?error=Family not found");
      }
      const units = await storage.getUnits(churchId);
      const familyMembers = await storage.getFamilyMembers(req.params.id, churchId);
      const availableMembers = await storage.getMembersNotInFamily(req.params.id, churchId);
      res.render("admin/family-form", {
        staffName: req.session.staffName,
        isEdit: true,
        family,
        units: units.filter(u => u.isActive),
        familyMembers,
        availableMembers,
        error: req.query.error,
        message: req.query.message,
      });
    } catch (error) {
      console.error("Error loading family:", error);
      res.redirect("/admin/families?error=Failed to load family");
    }
  });

  app.post("/admin/families/:id/edit", requireAdmin, async (req, res) => {
    try {
      const { name, unitId, dueAmount, dueFrequency, nextDueDate, dueNotes, primaryMemberId, addressLine1, addressLine2, city, county, postcode, country, contactPhone, contactName } = req.body;
      
      // Validate E.164 phone format if provided
      if (contactPhone && !contactPhone.startsWith('+')) {
        return res.redirect(`/admin/families/${req.params.id}/edit?error=Contact phone must be in E.164 format (start with +)`);
      }
      
      await storage.updateFamily(req.params.id, req.session.churchId!, {
        name,
        unitId: unitId || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        county: county || null,
        postcode: postcode || null,
        country: country || "UK",
        dueAmount: dueAmount || null,
        dueFrequency: dueFrequency || "monthly",
        nextDueDate: nextDueDate || null,
        dueNotes: dueNotes || null,
        primaryMemberId: primaryMemberId || null,
        contactPhone: contactPhone || null,
        contactName: contactName || null,
      });
      res.redirect("/admin/families?message=Family updated successfully");
    } catch (error) {
      console.error("Error updating family:", error);
      res.redirect(`/admin/families/${req.params.id}/edit?error=Failed to update family`);
    }
  });

  app.post("/admin/families/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFamily(req.params.id, req.session.churchId!);
      res.redirect("/admin/families?message=Family deleted successfully");
    } catch (error) {
      console.error("Error deleting family:", error);
      res.redirect("/admin/families?error=Failed to delete family. It may have related members.");
    }
  });

  // Family members management
  app.post("/admin/families/:id/members/add", requireAdmin, async (req, res) => {
    try {
      const { memberId, role } = req.body;
      await storage.addMemberToFamily({
        familyId: req.params.id,
        memberId,
        role: role || "member",
      });
      res.redirect(`/admin/families/${req.params.id}/edit?message=Member added to family`);
    } catch (error) {
      console.error("Error adding member to family:", error);
      res.redirect(`/admin/families/${req.params.id}/edit?error=Failed to add member`);
    }
  });

  app.post("/admin/families/:id/members/:memberId/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      await storage.updateFamilyMemberRole(req.params.id, req.params.memberId, role || "member");
      res.redirect(`/admin/families/${req.params.id}/edit?message=Member role updated`);
    } catch (error) {
      console.error("Error updating member role:", error);
      res.redirect(`/admin/families/${req.params.id}/edit?error=Failed to update role`);
    }
  });

  app.post("/admin/families/:id/members/:memberId/remove", requireAdmin, async (req, res) => {
    try {
      await storage.removeMemberFromFamily(req.params.id, req.params.memberId);
      res.redirect(`/admin/families/${req.params.id}/edit?message=Member removed from family`);
    } catch (error) {
      console.error("Error removing member from family:", error);
      res.redirect(`/admin/families/${req.params.id}/edit?error=Failed to remove member`);
    }
  });

  // ============= FAMILY MEMBERS JSON API =============
  
  // GET /api/admin/families/:id/members - Get all members of a family
  app.get("/api/admin/families/:id/members", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const familyMembers = await storage.getFamilyMembers(req.params.id, churchId);
      res.json({ success: true, members: familyMembers });
    } catch (error) {
      console.error("Error getting family members:", error);
      res.status(500).json({ success: false, error: "Failed to get family members" });
    }
  });
  
  // POST /api/admin/families/:id/members - Add a member to a family
  app.post("/api/admin/families/:id/members", requireAdmin, async (req, res) => {
    try {
      const { memberId, role } = req.body;
      if (!memberId) {
        return res.status(400).json({ success: false, error: "Member ID is required" });
      }
      
      // Check for duplicates
      const isDuplicate = await storage.isMemberInFamily(req.params.id, memberId);
      if (isDuplicate) {
        return res.status(400).json({ success: false, error: "Member is already in this family" });
      }
      
      const familyMember = await storage.addMemberToFamily({
        familyId: req.params.id,
        memberId,
        role: role || "member",
      });
      
      // Get the member details to return
      const churchId = req.session.churchId!;
      const familyMembers = await storage.getFamilyMembers(req.params.id, churchId);
      const addedMember = familyMembers.find(fm => fm.memberId === memberId);
      
      res.json({ success: true, member: addedMember });
    } catch (error: any) {
      console.error("Error adding member to family:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to add member" });
    }
  });
  
  // DELETE /api/admin/families/:id/members/:memberId - Remove a member from a family
  app.delete("/api/admin/families/:id/members/:memberId", requireAdmin, async (req, res) => {
    try {
      await storage.removeMemberFromFamily(req.params.id, req.params.memberId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member from family:", error);
      res.status(500).json({ success: false, error: "Failed to remove member" });
    }
  });
  
  // GET /api/admin/families/:id/members/search - Search members for typeahead (excludes existing family members)
  app.get("/api/admin/families/:id/members/search", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const query = (req.query.q as string) || "";
      
      if (query.length < 2) {
        return res.json({ success: true, members: [] });
      }
      
      const members = await storage.searchMembersForFamily(req.params.id, churchId, query);
      res.json({ 
        success: true, 
        members: members.map(m => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          phone: m.phone,
          email: m.email || null
        }))
      });
    } catch (error) {
      console.error("Error searching members:", error);
      res.status(500).json({ success: false, error: "Failed to search members" });
    }
  });

  // ============= PASTORS CRUD =============

  app.get("/admin/pastors", requireAdmin, async (req, res) => {
    const pastors = await storage.getPastors(req.session.churchId!);
    res.render("admin/pastors", {
      staffName: req.session.staffName,
      pastors,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/pastors/new", requireAdmin, (req, res) => {
    res.render("admin/pastor-form", {
      staffName: req.session.staffName,
      isEdit: false,
      pastor: null,
      error: req.query.error,
    });
  });

  app.post("/admin/pastors/new", requireAdmin, async (req, res) => {
    try {
      const { name, phone, email } = req.body;
      await storage.createPastor({
        churchId: req.session.churchId!,
        name,
        phone: phone || null,
        email: email || null,
      });
      res.redirect("/admin/pastors?message=Pastor created successfully");
    } catch (error) {
      console.error("Error creating pastor:", error);
      res.redirect("/admin/pastors/new?error=Failed to create pastor");
    }
  });

  app.get("/admin/pastors/:id/edit", requireAdmin, async (req, res) => {
    try {
      const pastor = await storage.getPastor(req.params.id, req.session.churchId!);
      if (!pastor) {
        return res.redirect("/admin/pastors?error=Pastor not found");
      }
      res.render("admin/pastor-form", {
        staffName: req.session.staffName,
        isEdit: true,
        pastor,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading pastor:", error);
      res.redirect("/admin/pastors?error=Failed to load pastor");
    }
  });

  app.post("/admin/pastors/:id/edit", requireAdmin, async (req, res) => {
    try {
      const { name, phone, email, isActive } = req.body;
      await storage.updatePastor(req.params.id, req.session.churchId!, {
        name,
        phone: phone || null,
        email: email || null,
        isActive: isActive === "on",
      });
      res.redirect("/admin/pastors?message=Pastor updated successfully");
    } catch (error) {
      console.error("Error updating pastor:", error);
      res.redirect(`/admin/pastors/${req.params.id}/edit?error=Failed to update pastor`);
    }
  });

  app.post("/admin/pastors/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deletePastor(req.params.id, req.session.churchId!);
      res.redirect("/admin/pastors?message=Pastor deleted successfully");
    } catch (error) {
      console.error("Error deleting pastor:", error);
      res.redirect("/admin/pastors?error=Failed to delete pastor. They may be assigned to prayer requests.");
    }
  });

  // ============= UNITS CRUD =============

  app.get("/admin/units", requireAdmin, async (req, res) => {
    // Filter: 'active' (default), 'archived', or 'all'
    const show = (req.query.show as string) || 'active';
    const filter = show === 'all' ? 'all' : show === 'archived' ? 'archived' : 'active';
    const units = await storage.getUnitsWithMemberCount(req.session.churchId!, filter);
    res.render("admin/units", {
      staffName: req.session.staffName,
      units,
      currentFilter: filter,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/units/new", requireAdmin, (req, res) => {
    res.render("admin/unit-form", {
      staffName: req.session.staffName,
      isEdit: false,
      unit: null,
      error: req.query.error,
    });
  });

  app.post("/admin/units", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      const churchId = req.session.churchId!;
      
      // Check for duplicate unit name
      if (await storage.unitNameExists(name, churchId)) {
        return res.redirect("/admin/units/new?error=Unit name already exists");
      }
      
      await storage.createUnit({
        churchId,
        name,
        description: description || null,
      });
      res.redirect("/admin/units?message=Unit created successfully");
    } catch (error) {
      console.error("Error creating unit:", error);
      res.redirect("/admin/units/new?error=Failed to create unit");
    }
  });

  app.get("/admin/units/:id/edit", requireAdmin, async (req, res) => {
    try {
      const unit = await storage.getUnit(req.params.id, req.session.churchId!);
      if (!unit) {
        return res.redirect("/admin/units?error=Unit not found");
      }
      res.render("admin/unit-form", {
        staffName: req.session.staffName,
        isEdit: true,
        unit,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading unit:", error);
      res.redirect("/admin/units?error=Failed to load unit");
    }
  });

  app.post("/admin/units/:id", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      const churchId = req.session.churchId!;
      const unitId = req.params.id;
      
      // Check for duplicate unit name (excluding current unit)
      if (await storage.unitNameExists(name, churchId, unitId)) {
        return res.redirect(`/admin/units/${unitId}/edit?error=Unit name already exists`);
      }
      
      await storage.updateUnit(unitId, churchId, {
        name,
        description: description || null,
      });
      res.redirect("/admin/units?message=Unit updated successfully");
    } catch (error) {
      console.error("Error updating unit:", error);
      res.redirect(`/admin/units/${req.params.id}/edit?error=Failed to update unit`);
    }
  });

  app.post("/admin/units/:id/archive", requireAdmin, async (req, res) => {
    try {
      await storage.archiveUnit(req.params.id, req.session.churchId!);
      res.redirect("/admin/units?message=Unit archived successfully");
    } catch (error) {
      console.error("Error archiving unit:", error);
      res.redirect("/admin/units?error=Failed to archive unit");
    }
  });

  app.post("/admin/units/:id/restore", requireAdmin, async (req, res) => {
    try {
      await storage.restoreUnit(req.params.id, req.session.churchId!);
      res.redirect("/admin/units?show=all&message=Unit restored successfully");
    } catch (error) {
      console.error("Error restoring unit:", error);
      res.redirect("/admin/units?show=archived&error=Failed to restore unit");
    }
  });

  // ============= EVENTS =============

  app.get("/admin/events", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const events = await storage.getMassEvents(churchId);

    const eventsWithCounts = await Promise.all(
      events.map(async (e) => ({
        ...e,
        attendanceCount: await storage.getAttendanceCount(e.id, churchId),
      }))
    );

    res.render("admin/events", {
      staffName: req.session.staffName,
      events: eventsWithCounts,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/events/new", requireAdmin, (req, res) => {
    res.render("admin/event-form", {
      staffName: req.session.staffName,
      error: req.query.error,
    });
  });

  app.post("/admin/events/new", requireAdmin, async (req, res) => {
    const { title, eventDate, location } = req.body;
    await storage.createMassEvent({
      churchId: req.session.churchId!,
      title,
      eventDate: new Date(eventDate),
      location: location || null,
      attendanceOpen: false,
      qrToken: generateToken(),
    });
    res.redirect("/admin/events?message=Meeting created successfully");
  });

  app.post("/admin/events/:id/open", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;

    const openEvent = await storage.getOpenMassEvent(churchId);
    if (openEvent && openEvent.id !== req.params.id) {
      await storage.updateMassEvent(openEvent.id, churchId, { attendanceOpen: false });
    }

    await storage.updateMassEvent(req.params.id, churchId, {
      attendanceOpen: true,
      qrToken: generateToken(),
      attendanceWindowStart: new Date(),
    });

    res.redirect(`/admin/events/${req.params.id}/qr`);
  });

  app.post("/admin/events/:id/close", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    const { sendFollowup } = req.body;
    
    await storage.updateMassEvent(eventId, churchId, {
      attendanceOpen: false,
      attendanceWindowEnd: new Date(),
    });
    
    // If checkbox was checked, send follow-up SMS immediately
    if (sendFollowup === '1') {
      // Check TWILIO_FROM_NUMBER
      if (!process.env.TWILIO_FROM_NUMBER) {
        return res.redirect(`/admin/events?message=Attendance closed&error=${encodeURIComponent('Set TWILIO_FROM_NUMBER to send SMS')}`);
      }
      
      const defaultTemplate = followUpTemplates[0];
      const absentees = await storage.getAbsenteesForEvent(eventId, churchId);
      let sentCount = 0;
      let failedCount = 0;
      
      for (const member of absentees) {
        const isDuplicate = await storage.checkDuplicateMessage(eventId, member.id, defaultTemplate.key, churchId);
        if (isDuplicate) continue;
        
        const messageText = renderTemplate(defaultTemplate.text, member.firstName);
        const outboundMsg = await storage.createOutboundMessage({
          churchId,
          recipientPhone: member.phone!,
          messageText,
          status: "queued",
          eventId,
          memberId: member.id,
          templateKey: defaultTemplate.key,
        });
        
        const result = await sendSms(member.phone!, messageText);
        if (result.success) {
          await storage.updateOutboundMessageStatus(outboundMsg.id, "sent", null);
          sentCount++;
        } else {
          await storage.updateOutboundMessageStatus(outboundMsg.id, "failed", result.error || "Unknown error");
          failedCount++;
        }
      }
      
      const msg = `Attendance closed. Follow-up: Sent ${sentCount}, Failed ${failedCount}`;
      return res.redirect(`/admin/events?message=${encodeURIComponent(msg)}`);
    }
    
    res.redirect("/admin/events?message=Attendance closed");
  });

  app.get("/admin/events/:id/qr", requireAdmin, async (req, res) => {
    const event = await storage.getMassEvent(req.params.id, req.session.churchId!);
    if (!event) {
      return res.redirect("/admin/events?error=Event not found");
    }

    const host = req.get("host") || "localhost:5000";
    const protocol = req.secure ? "https" : "http";
    const attendanceUrl = `${protocol}://${host}/attendance/confirm?eventId=${event.id}`;

    const qrCodeUrl = await QRCode.toDataURL(attendanceUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#1e293b", light: "#ffffff" },
    });

    res.render("admin/event-qr", {
      staffName: req.session.staffName,
      event,
      qrCodeUrl,
      attendanceUrl,
    });
  });

  // ============= ATTENDANCE REPORT =============
  
  app.get("/admin/events/:id/report", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const event = await storage.getMassEvent(req.params.id, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Event not found");
    }
    
    const attendees = await storage.getAttendeesForEvent(event.id, churchId);
    const absentees = await storage.getAbsenteesForEvent(event.id, churchId);
    
    res.render("admin/attendance-report", {
      staffName: req.session.staffName,
      event,
      attendees,
      absentees,
      templates: followUpTemplates,
      message: req.query.message,
      error: req.query.error,
    });
  });
  
  app.post("/admin/events/:id/queue-followup", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    const { templateKey } = req.body;
    
    const event = await storage.getMassEvent(eventId, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Event not found");
    }
    
    const template = getTemplateByKey(templateKey);
    if (!template) {
      return res.redirect(`/admin/events/${eventId}/report?error=Invalid message template`);
    }
    
    const absentees = await storage.getAbsenteesForEvent(eventId, churchId);
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const member of absentees) {
      if (!member.isActive) {
        skippedCount++;
        continue;
      }
      
      // Check for duplicate notification
      const isDuplicate = await storage.checkDuplicateNotification(member.id, churchId, 'care_followup', eventId);
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // Render the message with member's name
      const messageText = renderTemplate(template.text, member.firstName);
      
      // Create in-app notification instead of outbound message
      await storage.createNotification({
        churchId,
        memberId: member.id,
        title: 'We Missed You',
        body: `${messageText} [Event: ${event.title}]`,
        type: 'care_followup',
        createdByStaffId: req.session.staffId,
      });
      
      createdCount++;
    }
    
    const message = `In-app notifications created: ${createdCount}${skippedCount > 0 ? `, skipped: ${skippedCount}` : ''}`;
    res.redirect(`/admin/events/${eventId}/report?message=${encodeURIComponent(message)}`);
  });
  
  // Send follow-up care notifications (in-app) to absentees
  app.post("/admin/events/:id/send-followup", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    const { templateKey } = req.body;
    
    const event = await storage.getMassEvent(eventId, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Event not found");
    }
    
    const template = getTemplateByKey(templateKey);
    if (!template) {
      return res.redirect(`/admin/events/${eventId}/report?error=Invalid message template`);
    }
    
    const absentees = await storage.getAbsenteesForEvent(eventId, churchId);
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const member of absentees) {
      if (!member.isActive) {
        skippedCount++;
        continue;
      }
      
      // Check for duplicate notification (same type + event context today)
      const isDuplicate = await storage.checkDuplicateNotification(member.id, churchId, 'care_followup', eventId);
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // Render the message with member's name
      const messageText = renderTemplate(template.text, member.firstName);
      
      // Create in-app notification instead of SMS
      await storage.createNotification({
        churchId,
        memberId: member.id,
        title: 'We Missed You',
        body: `${messageText} [Event: ${event.title}]`,
        type: 'care_followup',
        createdByStaffId: req.session.staffId,
      });
      
      createdCount++;
    }
    
    const parts = [];
    if (createdCount > 0) parts.push(`In-app care notifications created: ${createdCount}`);
    if (skippedCount > 0) parts.push(`Skipped: ${skippedCount}`);
    const message = parts.length > 0 ? parts.join(', ') : 'No messages to send';
    
    res.redirect(`/admin/events/${eventId}/report?message=${encodeURIComponent(message)}`);
  });

  // ============= MEETING CHECK-IN =============
  
  // Generate a random alphanumeric code (6 chars)
  function generateCheckInCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  // Start check-in for a meeting
  app.post("/admin/events/:id/start-checkin", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    
    const event = await storage.getMassEvent(eventId, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Meeting not found");
    }
    
    const code = generateCheckInCode();
    const codeHash = hashPasswordSHA256(code.toUpperCase());
    
    await storage.startMeetingCheckIn(eventId, churchId, codeHash);
    
    // Store the plain code temporarily in session for display
    req.session.lastCheckInCode = code;
    
    res.redirect(`/admin/events/${eventId}/checkin`);
  });
  
  // View check-in code page
  app.get("/admin/events/:id/checkin", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    
    const event = await storage.getMassEvent(eventId, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Meeting not found");
    }
    
    if (event.checkInStatus !== 'active') {
      return res.redirect("/admin/events?error=Check-in is not active for this meeting");
    }
    
    // Get the code from session or generate new display code
    let checkInCode = req.session.lastCheckInCode;
    if (!checkInCode) {
      // If no code in session, regenerate one (rare edge case)
      checkInCode = generateCheckInCode();
      const codeHash = hashPasswordSHA256(checkInCode.toUpperCase());
      await storage.updateMassEvent(eventId, churchId, { checkInCodeHash: codeHash } as any);
      req.session.lastCheckInCode = checkInCode;
    }
    
    // Generate QR code URL (encodes the code for member scanning)
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://hfniconnect.com' 
      : `http://localhost:${process.env.PORT || 5000}`;
    const qrUrl = `${baseUrl}/checkin?code=${checkInCode}`;
    const qrCodeUrl = await QRCode.toDataURL(qrUrl, { width: 300 });
    
    res.render("admin/meeting-checkin", {
      staffName: req.session.staffName,
      event,
      checkInCode,
      qrCodeUrl,
      expiresAt: event.attendanceWindowEnd?.toISOString() || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
  });
  
  // End check-in for a meeting
  app.post("/admin/events/:id/end-checkin", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    
    await storage.endMeetingCheckIn(eventId, churchId);
    delete req.session.lastCheckInCode;
    
    res.redirect("/admin/events?message=Check-in ended");
  });
  
  // View attendance for a meeting (admin override)
  app.get("/admin/events/:id/attendance", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    
    const event = await storage.getMassEvent(eventId, churchId);
    if (!event) {
      return res.redirect("/admin/events?error=Meeting not found");
    }
    
    const attendanceList = await storage.getAttendanceForEventWithMembers(eventId, churchId);
    const allMembers = await storage.getMembers(churchId);
    const totalMembers = allMembers.length;
    
    res.render("admin/meeting-attendance", {
      staffName: req.session.staffName,
      event,
      attendanceList,
      allMembers,
      totalMembers,
      message: req.query.message,
      error: req.query.error,
    });
  });
  
  // Add attendance manually (admin)
  app.post("/admin/events/:id/attendance/add", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    const { memberId } = req.body;
    
    if (!memberId) {
      return res.redirect(`/admin/events/${eventId}/attendance?error=Please select a member`);
    }
    
    // Check if already checked in
    const existing = await storage.getAttendanceByMemberAndEvent(memberId, eventId, churchId);
    if (existing) {
      return res.redirect(`/admin/events/${eventId}/attendance?error=Member already marked present`);
    }
    
    await storage.createAttendance({
      churchId,
      eventId,
      memberId,
      status: 'present',
      markedByAdmin: true,
    });
    
    res.redirect(`/admin/events/${eventId}/attendance?message=Member marked present`);
  });
  
  // Remove attendance (admin)
  app.post("/admin/events/:id/attendance/:attendanceId/remove", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const eventId = req.params.id;
    const attendanceId = req.params.attendanceId;
    
    await storage.deleteAttendance(attendanceId, churchId);
    
    res.redirect(`/admin/events/${eventId}/attendance?message=Attendance record removed`);
  });
  
  // Bulk attendance API (admin)
  app.post("/api/admin/attendance/bulk", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const { meetingId, memberIds, status } = req.body;
      
      if (!meetingId || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ ok: false, error: "Missing required fields" });
      }
      
      if (!['present', 'absent', 'clear'].includes(status)) {
        return res.status(400).json({ ok: false, error: "Invalid status. Use 'present', 'absent', or 'clear'" });
      }
      
      // Verify meeting exists and belongs to church
      const event = await storage.getMassEvent(meetingId, churchId);
      if (!event) {
        return res.status(404).json({ ok: false, error: "Meeting not found" });
      }
      
      // Fetch all existing attendance for this event in one query (optimization)
      const existingAttendance = await storage.getAttendanceForEvent(meetingId, churchId);
      const attendanceMap = new Map(existingAttendance.map(a => [a.memberId, a]));
      const memberIdSet = new Set(memberIds);
      
      let processed = 0;
      let skipped = 0;
      
      if (status === 'clear' || status === 'absent') {
        // Delete attendance records for selected members
        const toDelete = existingAttendance.filter(a => memberIdSet.has(a.memberId));
        for (const record of toDelete) {
          await storage.deleteAttendance(record.id, churchId);
          processed++;
        }
        skipped = memberIds.length - toDelete.length;
      } else if (status === 'present') {
        // Mark as present (create if not exists)
        const toCreate = memberIds.filter(id => !attendanceMap.has(id));
        for (const memberId of toCreate) {
          await storage.createAttendance({
            churchId,
            eventId: meetingId,
            memberId,
            status: 'present',
            markedByAdmin: true,
          });
          processed++;
        }
        skipped = memberIds.length - toCreate.length; // Already present
      }
      
      return res.json({ 
        ok: true, 
        message: `${processed} member(s) updated, ${skipped} skipped`,
        processed,
        skipped
      });
    } catch (err: any) {
      console.error("[BULK ATTENDANCE] Error:", err.message);
      return res.status(500).json({ ok: false, error: "Failed to update attendance" });
    }
  });

  // ============= MEMBER CHECK-IN ROUTES =============
  
  // Member check-in page
  app.get("/checkin", requireMember, (req, res) => {
    const code = req.query.code as string | undefined;
    
    // If code provided in URL (from QR scan), auto-submit
    if (code) {
      return res.redirect(307, `/checkin?autoCode=${encodeURIComponent(code)}`);
    }
    
    res.render("member/checkin", {
      memberName: req.session.memberName,
      error: req.query.error,
      message: req.query.message,
    });
  });
  
  // QR code scanner page
  app.get("/checkin/scan", requireMember, (req, res) => {
    res.render("member/checkin-scan", {
      memberName: req.session.memberName,
    });
  });
  
  // Member check-in submit
  app.post("/checkin", requireMember, async (req, res) => {
    const churchId = req.session.churchId!;
    const memberId = req.session.memberId!;
    let { code } = req.body;
    
    if (!code || code.trim().length < 4) {
      return res.render("member/checkin", {
        memberName: req.session.memberName,
        error: "Please enter a valid check-in code",
      });
    }
    
    code = code.trim().toUpperCase();
    const codeHash = hashPasswordSHA256(code);
    
    // Find active meeting with matching code
    const meeting = await storage.getMeetingByCheckInCode(codeHash, churchId);
    if (!meeting) {
      return res.render("member/checkin", {
        memberName: req.session.memberName,
        error: "Invalid check-in code or meeting check-in has ended",
      });
    }
    
    // Check if within time window (2 hours)
    const now = new Date();
    if (meeting.attendanceWindowEnd && now > meeting.attendanceWindowEnd) {
      return res.render("member/checkin", {
        memberName: req.session.memberName,
        error: "Check-in has expired for this meeting",
      });
    }
    
    // Check for duplicate
    const existing = await storage.getAttendanceByMemberAndEvent(memberId, meeting.id, churchId);
    if (existing) {
      return res.render("member/checkin-success", {
        memberName: req.session.memberName,
        event: meeting,
        message: "You were already checked in for this meeting",
      });
    }
    
    // Create attendance record
    await storage.createAttendance({
      churchId,
      eventId: meeting.id,
      memberId,
      status: 'present',
      markedByAdmin: false,
    });
    
    res.render("member/checkin-success", {
      memberName: req.session.memberName,
      event: meeting,
    });
  });

  // ============= PRAYER REQUESTS =============

  app.get("/admin/prayers", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const status = req.query.status as string | undefined;
    const pastors = await storage.getPastors(churchId);
    const members = await storage.getMembers(churchId);
    const units = await storage.getUnits(churchId);

    const requests = await storage.getPrayerRequests(churchId, status);

    const enrichedRequests = requests.map((r) => {
      const member = members.find((m) => m.id === r.memberId);
      const pastor = pastors.find((p) => p.id === r.pastorId);
      const unit = units.find((u) => u.id === r.unitId);
      return {
        ...r,
        memberName: member ? `${member.firstName} ${member.lastName}` : "Unknown",
        pastorName: pastor?.name,
        unitName: unit?.name,
      };
    });

    res.render("admin/prayers", {
      staffName: req.session.staffName,
      requests: enrichedRequests,
      pastors,
      status,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.post("/admin/prayers/:id/accept", requireAdmin, async (req, res) => {
    const { pastorId } = req.body;
    await storage.updatePrayerRequest(req.params.id, req.session.churchId!, {
      status: "accepted",
      pastorId: pastorId || null,
    });
    res.redirect("/admin/prayers?message=Prayer request accepted");
  });

  app.post("/admin/prayers/:id/close", requireAdmin, async (req, res) => {
    await storage.updatePrayerRequest(req.params.id, req.session.churchId!, {
      status: "closed",
    });
    res.redirect("/admin/prayers?message=Prayer request closed");
  });

  // ============= DUES =============

  app.get("/admin/dues", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const filter = (req.query.filter as string) || "all";
    const tab = (req.query.tab as string) || "families";
    
    if (tab === "individuals") {
      const membersWithStatus = await storage.getMembersWithPaymentStatus(churchId, currentYear, currentMonth);
      
      let filteredMembers = membersWithStatus;
      if (filter === "paid") {
        filteredMembers = membersWithStatus.filter(m => m.isPaid);
      } else if (filter === "unpaid") {
        filteredMembers = membersWithStatus.filter(m => !m.isPaid);
      }
      
      const paidCount = membersWithStatus.filter(m => m.isPaid).length;
      const unpaidCount = membersWithStatus.filter(m => !m.isPaid).length;
      
      res.render("admin/dues", {
        staffName: req.session.staffName,
        tab,
        individuals: filteredMembers,
        families: [],
        filter,
        paidCount,
        unpaidCount,
        totalCount: membersWithStatus.length,
        currentMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        message: req.query.message,
        error: req.query.error,
      });
    } else {
      const familiesWithStatus = await storage.getFamiliesWithPaymentStatus(churchId, currentYear, currentMonth);
      
      let filteredFamilies = familiesWithStatus;
      if (filter === "paid") {
        filteredFamilies = familiesWithStatus.filter(f => f.isPaid);
      } else if (filter === "unpaid") {
        filteredFamilies = familiesWithStatus.filter(f => !f.isPaid);
      }
      
      const paidCount = familiesWithStatus.filter(f => f.isPaid).length;
      const unpaidCount = familiesWithStatus.filter(f => !f.isPaid).length;
      
      res.render("admin/dues", {
        staffName: req.session.staffName,
        tab,
        families: filteredFamilies,
        individuals: [],
        filter,
        paidCount,
        unpaidCount,
        totalCount: familiesWithStatus.length,
        currentMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        message: req.query.message,
        error: req.query.error,
      });
    }
  });

  app.post("/admin/dues/family/:id/mark-paid", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const family = await storage.getFamily(req.params.id, churchId);
    if (!family) {
      return res.redirect("/admin/dues?error=Family not found");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    await storage.markFamilyPaid(churchId, family.id, currentYear, currentMonth, family.dueAmount || "0", req.session.staffId);

    res.redirect("/admin/dues?tab=families&message=Payment recorded for " + family.name);
  });
  
  app.post("/admin/dues/family/:id/mark-unpaid", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const family = await storage.getFamily(req.params.id, churchId);
    if (!family) {
      return res.redirect("/admin/dues?error=Family not found");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    await storage.markFamilyUnpaid(churchId, family.id, currentYear, currentMonth);

    res.redirect("/admin/dues?tab=families&message=Payment undone for " + family.name);
  });
  
  app.post("/admin/dues/member/:id/mark-paid", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const member = await storage.getMember(req.params.id, churchId);
    if (!member) {
      return res.redirect("/admin/dues?tab=individuals&error=Member not found");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    await storage.markMemberPaid(churchId, member.id, currentYear, currentMonth, member.duesAmount || "0", req.session.staffId);

    res.redirect("/admin/dues?tab=individuals&message=Payment recorded for " + member.firstName + " " + member.lastName);
  });
  
  app.post("/admin/dues/member/:id/mark-unpaid", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const member = await storage.getMember(req.params.id, churchId);
    if (!member) {
      return res.redirect("/admin/dues?tab=individuals&error=Member not found");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    await storage.markMemberUnpaid(churchId, member.id, currentYear, currentMonth);

    res.redirect("/admin/dues?tab=individuals&message=Payment undone for " + member.firstName + " " + member.lastName);
  });
  
  // ============= DUES REMINDERS =============
  
  app.get("/admin/dues/reminders", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const tab = (req.query.tab as string) || "families";
    
    if (tab === "individuals") {
      // Get unpaid members for current month
      const unpaidMembers = await storage.getUnpaidMembers(churchId, currentYear, currentMonth);
      
      interface MemberWithInfo {
        member: typeof unpaidMembers[0];
        remindersThisMonth: number;
        eligible: boolean;
        skipReason?: string;
      }
      
      const unpaidIndividuals: MemberWithInfo[] = [];
      let eligibleCount = 0;
      let remindersAlreadySent = 0;
      
      for (const member of unpaidMembers) {
        const remindersThisMonth = await storage.countMemberDuesRemindersThisMonth(member.id, churchId);
        remindersAlreadySent += remindersThisMonth;
        
        let eligible = true;
        let skipReason: string | undefined;
        
        if (!member.smsConsent) {
          eligible = false;
          skipReason = "No SMS consent";
        } else if (remindersThisMonth >= 2) {
          eligible = false;
          skipReason = "Already sent 2 reminders this month";
        }
        
        if (eligible) eligibleCount++;
        
        unpaidIndividuals.push({
          member,
          remindersThisMonth,
          eligible,
          skipReason,
        });
      }
      
      res.render("admin/dues-reminders", {
        staffName: req.session.staffName,
        tab,
        unpaidCount: unpaidMembers.length,
        eligibleCount,
        remindersAlreadySent,
        unpaidIndividuals,
        unpaidWithContacts: [],
        currentMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        templates: duesReminderTemplates,
        message: req.query.message,
        error: req.query.error,
      });
    } else {
      // Get unpaid families for current month
      const unpaidFamilies = await storage.getUnpaidFamilies(churchId, currentYear, currentMonth);
      
      interface FamilyWithContact {
        family: typeof unpaidFamilies[0];
        contact: Awaited<ReturnType<typeof storage.getFamilyContact>>;
        contactName?: string;
        contactPhone?: string;
        remindersThisMonth: number;
        eligible: boolean;
        skipReason?: string;
      }
      
      const unpaidWithContacts: FamilyWithContact[] = [];
      let eligibleCount = 0;
      let remindersAlreadySent = 0;
      
      for (const family of unpaidFamilies) {
        let contactPhone: string | undefined;
        let contactName: string | undefined;
        let contact: Awaited<ReturnType<typeof storage.getFamilyContact>> = null;
        
        // Priority: contactPhone/contactName if set, otherwise getFamilyContact
        if (family.contactPhone) {
          contactPhone = family.contactPhone;
          contactName = family.contactName || family.name;
        } else {
          contact = await storage.getFamilyContact(family.id, churchId);
          if (contact) {
            contactPhone = contact.phone;
            contactName = `${contact.firstName} ${contact.lastName}`;
          }
        }
        
        const remindersThisMonth = await storage.countDuesRemindersThisMonth(family.id, churchId);
        remindersAlreadySent += remindersThisMonth;
        
        let eligible = true;
        let skipReason: string | undefined;
        
        if (!contactPhone) {
          eligible = false;
          skipReason = "No phone contact";
        } else if (remindersThisMonth >= 2) {
          eligible = false;
          skipReason = "Already sent 2 reminders this month";
        }
        
        if (eligible) eligibleCount++;
        
        unpaidWithContacts.push({
          family,
          contact,
          contactName,
          contactPhone,
          remindersThisMonth,
          eligible,
          skipReason,
        });
      }
      
      res.render("admin/dues-reminders", {
        staffName: req.session.staffName,
        tab,
        unpaidCount: unpaidFamilies.length,
        eligibleCount,
        remindersAlreadySent,
        unpaidWithContacts,
        unpaidIndividuals: [],
        currentMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        templates: duesReminderTemplates,
        message: req.query.message,
        error: req.query.error,
      });
    }
  });
  
  app.post("/admin/dues/reminders/send", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const { templateKey, tab } = req.body;
    const activeTab = tab || "families";
    
    const template = getDuesTemplateByKey(templateKey);
    if (!template) {
      return res.redirect(`/admin/dues/reminders?tab=${activeTab}&error=Invalid message template`);
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    let createdCount = 0;
    let skippedCount = 0;
    
    if (activeTab === "individuals") {
      // Get unpaid members for current month
      const unpaidMembers = await storage.getUnpaidMembers(churchId, currentYear, currentMonth);
      
      for (const member of unpaidMembers) {
        if (!member.isActive) {
          skippedCount++;
          continue;
        }
        
        // Check for duplicate notification today
        const isDuplicate = await storage.checkDuplicateNotification(member.id, churchId, 'dues_reminder');
        if (isDuplicate) {
          skippedCount++;
          continue;
        }
        
        const messageText = renderDuesTemplate(template.text, member.firstName, `${member.firstName} ${member.lastName}`);
        
        // Create in-app notification instead of SMS
        await storage.createNotification({
          churchId,
          memberId: member.id,
          title: 'Contribution Reminder',
          body: messageText,
          type: 'dues_reminder',
          createdByStaffId: req.session.staffId,
        });
        
        createdCount++;
      }
    } else {
      // Get unpaid families for current month
      const unpaidFamilies = await storage.getUnpaidFamilies(churchId, currentYear, currentMonth);
      
      for (const family of unpaidFamilies) {
        // Get family contact member to send notification to
        const contact = await storage.getFamilyContact(family.id, churchId);
        
        if (!contact) {
          skippedCount++;
          continue;
        }
        
        if (!contact.isActive) {
          skippedCount++;
          continue;
        }
        
        // Check for duplicate notification today
        const isDuplicate = await storage.checkDuplicateNotification(contact.id, churchId, 'dues_reminder');
        if (isDuplicate) {
          skippedCount++;
          continue;
        }
        
        const firstName = `${contact.firstName}`;
        const messageText = renderDuesTemplate(template.text, firstName, family.name);
        
        // Create in-app notification instead of SMS
        await storage.createNotification({
          churchId,
          memberId: contact.id,
          familyId: family.id,
          title: 'Contribution Reminder',
          body: messageText,
          type: 'dues_reminder',
          createdByStaffId: req.session.staffId,
        });
        
        createdCount++;
      }
    }
    
    const parts = [];
    if (createdCount > 0) parts.push(`In-app reminders created: ${createdCount}`);
    if (skippedCount > 0) parts.push(`Skipped: ${skippedCount}`);
    const message = parts.length > 0 ? parts.join(", ") : "No reminders to send";
    
    res.redirect(`/admin/dues/reminders?tab=${activeTab}&message=` + encodeURIComponent(message));
  });

  // ============= MINISTRY GROUPS CRUD =============
  
  // Fixed ministry groups configuration
  const FIXED_GROUPS = [
    { slug: 'elders', name: 'Elders & Ministers', description: 'Church elders and ministers' },
    { slug: 'tnt', name: 'TNT', description: 'TNT ministry group' },
    { slug: 'jesus-school', name: 'Jesus School', description: 'Jesus School ministry' },
    { slug: 'core-leaders', name: 'Core Leaders', description: 'Core leadership team' },
  ];
  
  // Helper to ensure fixed groups exist for a church
  async function ensureFixedGroups(churchId: string) {
    const existingGroups = await storage.getGroups(churchId);
    const existingNames = new Set(existingGroups.map(g => g.name));
    
    for (const fg of FIXED_GROUPS) {
      if (!existingNames.has(fg.name)) {
        await storage.createGroup({
          churchId,
          name: fg.name,
          description: fg.description,
        });
      }
    }
  }

  app.get("/admin/groups", requireAdmin, async (req, res) => {
    const show = (req.query.show as string) || 'active';
    const nameFilter = req.query.name as string | undefined;
    const filter = show === 'all' ? 'all' : show === 'archived' ? 'archived' : 'active';
    const churchId = req.session.churchId!;
    
    // If accessing a fixed ministry group by name, ensure groups exist and redirect to members page
    if (nameFilter) {
      const nameMap: Record<string, string> = {
        'elders': 'Elders & Ministers',
        'tnt': 'TNT',
        'jesus-school': 'Jesus School',
        'core-leaders': 'Core Leaders',
      };
      const targetName = nameMap[nameFilter];
      if (targetName) {
        // Ensure fixed groups exist
        await ensureFixedGroups(churchId);
        
        // Find the group and redirect to its members page
        const allGroups = await storage.getGroups(churchId);
        const group = allGroups.find(g => g.name === targetName);
        if (group) {
          // Render the group members page directly with the nameFilter context
          const groupMembers = await storage.getMembersByGroup(group.id, churchId);
          const allMembers = await storage.getMembers(churchId);
          const memberIds = new Set(groupMembers.map(m => m.id));
          const availableMembers = allMembers.filter(m => !memberIds.has(m.id) && m.isActive);
          
          return res.render("admin/group-members", {
            staffName: req.session.staffName,
            group,
            groupMembers,
            availableMembers,
            nameFilter,
            message: req.query.message,
            error: req.query.error,
          });
        }
      }
    }
    
    // For All Groups view, ensure fixed groups exist too
    await ensureFixedGroups(churchId);
    let groupsList = await storage.getGroupsWithMemberCount(churchId, filter);
    
    res.render("admin/groups", {
      staffName: req.session.staffName,
      groups: groupsList,
      currentFilter: filter,
      nameFilter: null,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/groups/new", requireAdmin, (req, res) => {
    res.render("admin/group-form", {
      staffName: req.session.staffName,
      isEdit: false,
      group: null,
      error: req.query.error,
    });
  });

  app.post("/admin/groups", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      const churchId = req.session.churchId!;
      
      await storage.createGroup({
        churchId,
        name,
        description: description || null,
      });
      res.redirect("/admin/groups?message=Ministry group created successfully");
    } catch (error) {
      console.error("Error creating group:", error);
      res.redirect("/admin/groups/new?error=Failed to create group");
    }
  });

  app.get("/admin/groups/:id/edit", requireAdmin, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.id, req.session.churchId!);
      if (!group) {
        return res.redirect("/admin/groups?error=Group not found");
      }
      res.render("admin/group-form", {
        staffName: req.session.staffName,
        isEdit: true,
        group,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading group:", error);
      res.redirect("/admin/groups?error=Failed to load group");
    }
  });

  app.post("/admin/groups/:id", requireAdmin, async (req, res) => {
    try {
      const { name, description } = req.body;
      await storage.updateGroup(req.params.id, req.session.churchId!, {
        name,
        description: description || null,
      });
      res.redirect("/admin/groups?message=Group updated successfully");
    } catch (error) {
      console.error("Error updating group:", error);
      res.redirect(`/admin/groups/${req.params.id}/edit?error=Failed to update group`);
    }
  });

  app.post("/admin/groups/:id/archive", requireAdmin, async (req, res) => {
    try {
      await storage.archiveGroup(req.params.id, req.session.churchId!);
      res.redirect("/admin/groups?message=Group archived successfully");
    } catch (error) {
      console.error("Error archiving group:", error);
      res.redirect("/admin/groups?error=Failed to archive group");
    }
  });

  app.post("/admin/groups/:id/restore", requireAdmin, async (req, res) => {
    try {
      await storage.restoreGroup(req.params.id, req.session.churchId!);
      res.redirect("/admin/groups?show=all&message=Group restored successfully");
    } catch (error) {
      console.error("Error restoring group:", error);
      res.redirect("/admin/groups?show=archived&error=Failed to restore group");
    }
  });

  // Group members management
  app.get("/admin/groups/:id/members", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const group = await storage.getGroup(req.params.id, churchId);
      if (!group) {
        return res.redirect("/admin/groups?error=Group not found");
      }
      const groupMembers = await storage.getMembersByGroup(req.params.id, churchId);
      const allMembers = await storage.getMembers(churchId);
      // Filter out members already in the group
      const memberIds = new Set(groupMembers.map(m => m.id));
      const availableMembers = allMembers.filter(m => !memberIds.has(m.id) && m.isActive);
      
      res.render("admin/group-members", {
        staffName: req.session.staffName,
        group,
        groupMembers,
        availableMembers,
        message: req.query.message,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading group members:", error);
      res.redirect("/admin/groups?error=Failed to load group members");
    }
  });

  app.post("/admin/groups/:id/members/add", requireAdmin, async (req, res) => {
    try {
      const { memberId } = req.body;
      const churchId = req.session.churchId!;
      const groupId = req.params.id;
      const fromFilter = req.query.from as string | undefined;
      
      // Build redirect URL
      const redirectUrl = fromFilter 
        ? `/admin/groups?name=${fromFilter}` 
        : `/admin/groups/${groupId}/members`;
      
      // Check if already in group
      const isInGroup = await storage.isMemberInGroup(groupId, memberId, churchId);
      if (isInGroup) {
        return res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=Member already in group`);
      }
      
      await storage.addMemberToGroup({
        churchId,
        groupId,
        memberId,
      });
      res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}message=Member added successfully`);
    } catch (error) {
      console.error("Error adding member to group:", error);
      const fromFilter = req.query.from as string | undefined;
      const redirectUrl = fromFilter 
        ? `/admin/groups?name=${fromFilter}` 
        : `/admin/groups/${req.params.id}/members`;
      res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=Failed to add member`);
    }
  });

  app.post("/admin/groups/:id/members/:memberId/remove", requireAdmin, async (req, res) => {
    try {
      await storage.removeMemberFromGroup(req.params.id, req.params.memberId, req.session.churchId!);
      const fromFilter = req.query.from as string | undefined;
      const redirectUrl = fromFilter 
        ? `/admin/groups?name=${fromFilter}` 
        : `/admin/groups/${req.params.id}/members`;
      res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}message=Member removed from group`);
    } catch (error) {
      console.error("Error removing member from group:", error);
      const fromFilter = req.query.from as string | undefined;
      const redirectUrl = fromFilter 
        ? `/admin/groups?name=${fromFilter}` 
        : `/admin/groups/${req.params.id}/members`;
      res.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=Failed to remove member`);
    }
  });

  // ============= ANNOUNCEMENTS CRUD =============
  
  app.get("/admin/announcements", requireAdmin, async (req, res) => {
    const announcementsList = await storage.getAnnouncements(req.session.churchId!);
    res.render("admin/announcements", {
      staffName: req.session.staffName,
      announcements: announcementsList,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/announcements/new", requireAdmin, (req, res) => {
    res.render("admin/announcement-form", {
      staffName: req.session.staffName,
      isEdit: false,
      announcement: null,
      error: req.query.error,
    });
  });

  app.post("/admin/announcements/new", requireAdmin, async (req, res) => {
    try {
      const { title, body, priority, sendNotifications } = req.body;
      const churchId = req.session.churchId!;
      
      // Create announcement
      const announcement = await storage.createAnnouncement({
        churchId,
        title,
        body,
        priority: priority || "normal",
        createdByStaffId: req.session.staffId,
      });
      
      // Create in-app notifications for all active members (checkbox checked by default)
      if (sendNotifications !== "off") {
        // Get all active members
        const allMembers = await storage.getMembers(churchId);
        const activeMembers = allMembers.filter(m => m.isActive);
        
        // Build notification body (snippet + link hint)
        const bodySnippet = body.length > 200 ? body.substring(0, 197) + "..." : body;
        
        let createdCount = 0;
        
        // Create notification for each active member
        for (const member of activeMembers) {
          await storage.createNotification({
            churchId,
            memberId: member.id,
            title: `Announcement: ${title}`,
            body: `${bodySnippet} — Open Announcements for full details.`,
            type: 'announcement',
            createdByStaffId: req.session.staffId,
          });
          createdCount++;
        }
        
        // Mark announcement as notified
        await storage.updateAnnouncement(announcement.id, churchId, {
          smsBroadcastSentAt: new Date(),
        });
        
        const msg = `Announcement created. In-app notifications sent to ${createdCount} members`;
        return res.redirect(`/admin/announcements?message=${encodeURIComponent(msg)}`);
      }
      
      res.redirect("/admin/announcements?message=Announcement created successfully");
    } catch (error) {
      console.error("Error creating announcement:", error);
      res.redirect("/admin/announcements/new?error=Failed to create announcement");
    }
  });

  app.get("/admin/announcements/:id/edit", requireAdmin, async (req, res) => {
    try {
      const announcement = await storage.getAnnouncement(req.params.id, req.session.churchId!);
      if (!announcement) {
        return res.redirect("/admin/announcements?error=Announcement not found");
      }
      res.render("admin/announcement-form", {
        staffName: req.session.staffName,
        isEdit: true,
        announcement,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading announcement:", error);
      res.redirect("/admin/announcements?error=Failed to load announcement");
    }
  });

  app.post("/admin/announcements/:id/edit", requireAdmin, async (req, res) => {
    try {
      const { title, body, priority } = req.body;
      await storage.updateAnnouncement(req.params.id, req.session.churchId!, {
        title,
        body,
        priority: priority || "normal",
      });
      res.redirect("/admin/announcements?message=Announcement updated successfully");
    } catch (error) {
      console.error("Error updating announcement:", error);
      res.redirect(`/admin/announcements/${req.params.id}/edit?error=Failed to update announcement`);
    }
  });

  app.post("/admin/announcements/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAnnouncement(req.params.id, req.session.churchId!);
      res.redirect("/admin/announcements?message=Announcement deleted successfully");
    } catch (error) {
      console.error("Error deleting announcement:", error);
      res.redirect("/admin/announcements?error=Failed to delete announcement");
    }
  });

  // ============= NOTIFICATIONS CRUD =============
  
  app.get("/admin/notifications", requireAdmin, async (req, res) => {
    const notificationsList = await storage.getNotifications(req.session.churchId!);
    res.render("admin/notifications", {
      staffName: req.session.staffName,
      notifications: notificationsList,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/notifications/new", requireAdmin, (req, res) => {
    res.render("admin/notification-form", {
      staffName: req.session.staffName,
      isEdit: false,
      notification: null,
      error: req.query.error,
    });
  });

  app.post("/admin/notifications/new", requireAdmin, async (req, res) => {
    try {
      const { title, body, type } = req.body;
      await storage.createNotification({
        churchId: req.session.churchId!,
        title,
        body,
        type: type || "general",
        createdByStaffId: req.session.staffId,
      });
      res.redirect("/admin/notifications?message=Notification created successfully");
    } catch (error) {
      console.error("Error creating notification:", error);
      res.redirect("/admin/notifications/new?error=Failed to create notification");
    }
  });

  app.post("/admin/notifications/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id, req.session.churchId!);
      res.redirect("/admin/notifications?message=Notification deleted successfully");
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.redirect("/admin/notifications?error=Failed to delete notification");
    }
  });

  // ============= ADMIN MESSAGES (CONVERSATIONS) =============
  
  app.get("/admin/messages", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const status = req.query.status as string | undefined;
    
    const conversations = await storage.getConversationsForAdmin(churchId, status);
    
    res.render("admin/messages", {
      staffName: req.session.staffName,
      conversations,
      status,
      message: req.query.message,
      error: req.query.error,
    });
  });
  
  app.get("/admin/messages/:id", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/admin/messages?error=Conversation not found");
    }
    
    const messages = await storage.getMessagesForConversation(conversation.id, churchId);
    
    // Get member name
    let memberName = 'Unknown';
    if (conversation.memberId) {
      const member = await storage.getMember(conversation.memberId, churchId);
      if (member) {
        memberName = `${member.firstName} ${member.lastName}`;
      }
    }
    
    res.render("admin/message-detail", {
      staffName: req.session.staffName,
      conversation,
      messages,
      memberName,
      error: req.query.error,
    });
  });
  
  app.post("/admin/messages/:id/reply", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    const staffId = req.session.staffId!;
    const { body } = req.body;
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/admin/messages?error=Conversation not found");
    }
    
    if (conversation.status !== 'open') {
      return res.redirect(`/admin/messages/${req.params.id}?error=This conversation is closed`);
    }
    
    if (!body || !body.trim()) {
      return res.redirect(`/admin/messages/${req.params.id}?error=Message cannot be empty`);
    }
    
    await storage.createMessage({
      churchId,
      conversationId: conversation.id,
      senderType: 'admin',
      senderStaffId: staffId,
      body: body.trim(),
    });
    
    res.redirect(`/admin/messages/${req.params.id}`);
  });
  
  app.post("/admin/messages/:id/close", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/admin/messages?error=Conversation not found");
    }
    
    await storage.updateConversation(req.params.id, churchId, { status: 'closed' });
    
    res.redirect(`/admin/messages/${req.params.id}?message=Conversation closed`);
  });
  
  app.post("/admin/messages/:id/reopen", requireAdmin, async (req, res) => {
    const churchId = req.session.churchId!;
    
    const conversation = await storage.getConversation(req.params.id, churchId);
    if (!conversation) {
      return res.redirect("/admin/messages?error=Conversation not found");
    }
    
    await storage.updateConversation(req.params.id, churchId, { status: 'open' });
    
    res.redirect(`/admin/messages/${req.params.id}?message=Conversation reopened`);
  });

  // ============= GALLERY CRUD =============
  
  app.get("/admin/gallery", requireAdmin, async (req, res) => {
    const items = await storage.getGalleryItems(req.session.churchId!);
    res.render("admin/gallery", {
      staffName: req.session.staffName,
      items,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/gallery/new", requireAdmin, (req, res) => {
    res.render("admin/gallery-form", {
      staffName: req.session.staffName,
      isEdit: false,
      item: null,
      error: req.query.error,
    });
  });

  app.post("/admin/gallery/new", requireAdmin, galleryUpload.single('imageFile'), async (req, res) => {
    try {
      const { title, url, mediaType, category } = req.body;
      
      // Determine image URL: uploaded file takes priority over URL
      let imageUrl = url;
      if (req.file) {
        imageUrl = `/uploads/gallery/${req.file.filename}`;
      }
      
      // Validate that we have either file or URL
      if (!imageUrl) {
        return res.redirect("/admin/gallery/new?error=Please provide an image file or URL");
      }
      
      await storage.createGalleryItem({
        churchId: req.session.churchId!,
        title,
        url: imageUrl,
        mediaType: mediaType || "photo",
        category: category || "general",
        createdByStaffId: req.session.staffId,
      });
      res.redirect("/admin/gallery?message=Gallery item added successfully");
    } catch (error: any) {
      console.error("Error creating gallery item:", error);
      const errorMsg = error.message || "Failed to add gallery item";
      res.redirect(`/admin/gallery/new?error=${encodeURIComponent(errorMsg)}`);
    }
  });

  app.post("/admin/gallery/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteGalleryItem(req.params.id, req.session.churchId!);
      res.redirect("/admin/gallery?message=Gallery item removed successfully");
    } catch (error) {
      console.error("Error deleting gallery item:", error);
      res.redirect("/admin/gallery?error=Failed to remove gallery item");
    }
  });

  // ============= TESTIMONIES CRUD =============
  
  app.get("/admin/testimonies", requireAdmin, async (req, res) => {
    const status = req.query.status as string | undefined;
    const testimoniesList = await storage.getTestimonies(req.session.churchId!, status);
    res.render("admin/testimonies", {
      staffName: req.session.staffName,
      testimonies: testimoniesList,
      currentStatus: status || "all",
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.post("/admin/testimonies/:id/approve", requireAdmin, async (req, res) => {
    try {
      await storage.updateTestimony(req.params.id, req.session.churchId!, {
        status: "approved",
        reviewedByStaffId: req.session.staffId,
        reviewedAt: new Date(),
      });
      res.redirect("/admin/testimonies?message=Testimony approved");
    } catch (error) {
      console.error("Error approving testimony:", error);
      res.redirect("/admin/testimonies?error=Failed to approve testimony");
    }
  });

  app.post("/admin/testimonies/:id/reject", requireAdmin, async (req, res) => {
    try {
      await storage.updateTestimony(req.params.id, req.session.churchId!, {
        status: "rejected",
        reviewedByStaffId: req.session.staffId,
        reviewedAt: new Date(),
      });
      res.redirect("/admin/testimonies?message=Testimony rejected");
    } catch (error) {
      console.error("Error rejecting testimony:", error);
      res.redirect("/admin/testimonies?error=Failed to reject testimony");
    }
  });

  app.post("/admin/testimonies/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteTestimony(req.params.id, req.session.churchId!);
      res.redirect("/admin/testimonies?message=Testimony deleted successfully");
    } catch (error) {
      console.error("Error deleting testimony:", error);
      res.redirect("/admin/testimonies?error=Failed to delete testimony");
    }
  });

  // ============= VOLUNTEER BOARD CRUD =============
  
  app.get("/admin/volunteer", requireAdmin, async (req, res) => {
    const requests = await storage.getVolunteerRequests(req.session.churchId!);
    res.render("admin/volunteer", {
      staffName: req.session.staffName,
      requests,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/volunteer/new", requireAdmin, (req, res) => {
    res.render("admin/volunteer-form", {
      staffName: req.session.staffName,
      isEdit: false,
      request: null,
      error: req.query.error,
    });
  });

  app.post("/admin/volunteer/new", requireAdmin, async (req, res) => {
    try {
      const { title, description, eventDate, startTime, endTime, location, requiredVolunteers } = req.body;
      await storage.createVolunteerRequest({
        churchId: req.session.churchId!,
        title,
        description: description || null,
        eventDate: eventDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        location: location || null,
        requiredVolunteers: requiredVolunteers ? parseInt(requiredVolunteers) : 1,
        createdByStaffId: req.session.staffId,
      });
      res.redirect("/admin/volunteer?message=Volunteer request created successfully");
    } catch (error) {
      console.error("Error creating volunteer request:", error);
      res.redirect("/admin/volunteer/new?error=Failed to create volunteer request");
    }
  });

  app.get("/admin/volunteer/:id/signups", requireAdmin, async (req, res) => {
    try {
      const request = await storage.getVolunteerRequest(req.params.id, req.session.churchId!);
      if (!request) {
        return res.redirect("/admin/volunteer?error=Request not found");
      }
      const signups = await storage.getVolunteerSignups(req.params.id, req.session.churchId!);
      res.render("admin/volunteer-signups", {
        staffName: req.session.staffName,
        request,
        signups,
        message: req.query.message,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading volunteer signups:", error);
      res.redirect("/admin/volunteer?error=Failed to load signups");
    }
  });

  app.post("/admin/volunteer/:id/close", requireAdmin, async (req, res) => {
    try {
      await storage.updateVolunteerRequest(req.params.id, req.session.churchId!, { status: "closed" });
      res.redirect("/admin/volunteer?message=Volunteer request closed");
    } catch (error) {
      console.error("Error closing volunteer request:", error);
      res.redirect("/admin/volunteer?error=Failed to close request");
    }
  });

  app.post("/admin/volunteer/:id/delete", requireAdmin, async (req, res) => {
    try {
      await storage.deleteVolunteerRequest(req.params.id, req.session.churchId!);
      res.redirect("/admin/volunteer?message=Volunteer request deleted successfully");
    } catch (error) {
      console.error("Error deleting volunteer request:", error);
      res.redirect("/admin/volunteer?error=Failed to delete request");
    }
  });

  // ============= CARPOOLING/RIDES =============
  
  app.get("/admin/carpooling", requireAdmin, async (req, res) => {
    const events = await storage.getMassEvents(req.session.churchId!);
    res.render("admin/carpooling", {
      staffName: req.session.staffName,
      events,
      message: req.query.message,
      error: req.query.error,
    });
  });

  app.get("/admin/carpooling/:meetingId", requireAdmin, async (req, res) => {
    try {
      const churchId = req.session.churchId!;
      const meeting = await storage.getMassEvent(req.params.meetingId, churchId);
      if (!meeting) {
        return res.redirect("/admin/carpooling?error=Meeting not found");
      }
      const offers = await storage.getRideOffers(req.params.meetingId, churchId);
      const requests = await storage.getRideRequests(req.params.meetingId, churchId);
      res.render("admin/carpooling-detail", {
        staffName: req.session.staffName,
        meeting,
        offers,
        requests,
        message: req.query.message,
        error: req.query.error,
      });
    } catch (error) {
      console.error("Error loading carpooling details:", error);
      res.redirect("/admin/carpooling?error=Failed to load carpooling details");
    }
  });

  app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });

}
