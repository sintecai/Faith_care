// Twilio Verify API integration for SMS OTP
// Uses Twilio Verify service for secure OTP send/verification
// No OTP storage required - Twilio handles verification state
// Supports two auth modes: API Key (default) or Auth Token (fallback)
import twilio from 'twilio';

// Cached Twilio client
let twilioClient: ReturnType<typeof twilio> | null = null;
// Track which auth mode was used
let authModeUsed: 'api_key' | 'auth_token' | null = null;

// In-memory rate limiting: phone -> last request timestamp
const rateLimitStore = new Map<string, number>();
const RATE_LIMIT_SECONDS = 60; // 1 minute cooldown between OTP requests

// In-memory rate limiting for max 3 OTP per 10 minutes
const otpCountStore = new Map<string, { count: number; windowStart: number }>();
const MAX_OTP_PER_WINDOW = 3;
const OTP_WINDOW_MINUTES = 10;

// Validate E.164 format: + followed by 8-15 digits
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

// Alias for backward compatibility
export function validateE164Phone(phone: string): boolean {
  return isE164(phone);
}

// Normalize UK phone numbers to E.164 format
export function normalizePhoneToE164UK(input: string): string {
  // Trim and remove common separators: spaces, (), -
  let phone = input.trim().replace(/[\s()\-]/g, '');
  
  // Already E.164 format
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // International format with 00 prefix (e.g., 0044...)
  if (phone.startsWith('00')) {
    return '+' + phone.slice(2);
  }
  
  // UK national format starting with 0 (e.g., 07123456789)
  if (phone.startsWith('0')) {
    return '+44' + phone.slice(1);
  }
  
  // Starts with 44 but missing + (e.g., 447123456789)
  if (phone.startsWith('44')) {
    return '+' + phone;
  }
  
  // Looks like UK national number (10-11 digits without prefix)
  if (/^\d{10,11}$/.test(phone)) {
    return '+44' + phone;
  }
  
  // Fallback: just prepend +
  return '+' + phone;
}

// Alias for backward compatibility
export function formatToE164(phone: string): string {
  return normalizePhoneToE164UK(phone);
}

// Check if phone is rate limited
export function isRateLimited(phone: string): boolean {
  const lastRequest = rateLimitStore.get(phone);
  if (!lastRequest) return false;
  
  const elapsed = (Date.now() - lastRequest) / 1000;
  return elapsed < RATE_LIMIT_SECONDS;
}

// Get remaining cooldown seconds
export function getRateLimitRemaining(phone: string): number {
  const lastRequest = rateLimitStore.get(phone);
  if (!lastRequest) return 0;
  
  const elapsed = (Date.now() - lastRequest) / 1000;
  return Math.max(0, Math.ceil(RATE_LIMIT_SECONDS - elapsed));
}

// Record OTP request for rate limiting
function recordOtpRequest(phone: string): void {
  rateLimitStore.set(phone, Date.now());
  
  // Also track count for max 3 per 10 minutes
  const now = Date.now();
  const entry = otpCountStore.get(phone);
  const windowMs = OTP_WINDOW_MINUTES * 60 * 1000;
  
  if (!entry || (now - entry.windowStart) > windowMs) {
    // Start new window
    otpCountStore.set(phone, { count: 1, windowStart: now });
  } else {
    // Increment within current window
    entry.count++;
    otpCountStore.set(phone, entry);
  }
}

// Check if max OTP per window exceeded
export function isMaxOtpExceeded(phone: string): boolean {
  const now = Date.now();
  const entry = otpCountStore.get(phone);
  if (!entry) return false;
  
  const windowMs = OTP_WINDOW_MINUTES * 60 * 1000;
  if ((now - entry.windowStart) > windowMs) {
    // Window expired, reset
    otpCountStore.delete(phone);
    return false;
  }
  
  return entry.count >= MAX_OTP_PER_WINDOW;
}

// Get remaining time until window resets
export function getOtpWindowResetSeconds(phone: string): number {
  const now = Date.now();
  const entry = otpCountStore.get(phone);
  if (!entry) return 0;
  
  const windowMs = OTP_WINDOW_MINUTES * 60 * 1000;
  const elapsed = now - entry.windowStart;
  if (elapsed > windowMs) return 0;
  
  return Math.ceil((windowMs - elapsed) / 1000);
}

// Check if we should use Auth Token mode instead of API Key mode
// Auto-detects based on whether TWILIO_AUTH_TOKEN is present and non-empty
function useAuthTokenMode(): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  return !!authToken && authToken.length > 0;
}

// Get Twilio client with fallback: API Key mode (default) or Auth Token mode
// API Key mode: twilio(apiKey, apiSecret, { accountSid })
// Auth Token mode: twilio(accountSid, authToken)
export function getTwilioClient(): ReturnType<typeof twilio> {
  if (twilioClient) return twilioClient;
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  
  if (useAuthTokenMode()) {
    // Auth Token mode - simpler, uses Account SID + Auth Token
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('Twilio Auth Token credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN');
    }
    
    console.log('Initializing Twilio client with Auth Token mode');
    twilioClient = twilio(accountSid, authToken);
    authModeUsed = 'auth_token';
  } else {
    // API Key mode - more secure, uses API Key + Secret + Account SID
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    
    if (!accountSid || !apiKey || !apiSecret) {
      throw new Error('Twilio API Key credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET');
    }
    
    console.log('Initializing Twilio client with API Key mode');
    twilioClient = twilio(apiKey, apiSecret, { accountSid });
    authModeUsed = 'api_key';
  }
  
  return twilioClient;
}

// Get the auth mode currently being used
export function getAuthMode(): string {
  return authModeUsed || (useAuthTokenMode() ? 'auth_token' : 'api_key');
}

// Reset the cached client (useful for testing mode switches)
export function resetTwilioClient(): void {
  twilioClient = null;
  authModeUsed = null;
}

// Get the Verify Service SID from environment variable
export function getVerifyServiceSid(): string {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    throw new Error('TWILIO_VERIFY_SERVICE_SID not configured');
  }
  return serviceSid;
}

// Send OTP via Twilio Verify API
export async function sendVerificationCode(phone: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate phone format
    const formattedPhone = formatToE164(phone);
    if (!validateE164Phone(formattedPhone)) {
      return { success: false, error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)' };
    }
    
    // Check rate limiting
    if (isRateLimited(formattedPhone)) {
      const remaining = getRateLimitRemaining(formattedPhone);
      return { success: false, error: `Please wait ${remaining} seconds before requesting another code` };
    }
    
    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();
    
    // Send verification code via Twilio Verify
    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({
        to: formattedPhone,
        channel: 'sms',
      });
    
    // Record request for rate limiting
    recordOtpRequest(formattedPhone);
    
    console.log(`Verification sent to ${formattedPhone}, status: ${verification.status}`);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send verification code:', error.message);
    return { success: false, error: error.message };
  }
}

// Verify OTP code via Twilio Verify API
export async function checkVerificationCode(phone: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const formattedPhone = formatToE164(phone);
    if (!validateE164Phone(formattedPhone)) {
      return { success: false, error: 'Invalid phone number format' };
    }
    
    const client = getTwilioClient();
    const serviceSid = getVerifyServiceSid();
    
    // Check verification code via Twilio Verify
    const verificationCheck = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: formattedPhone,
        code: code,
      });
    
    console.log(`Verification check for ${formattedPhone}, status: ${verificationCheck.status}`);
    
    if (verificationCheck.status === 'approved') {
      return { success: true };
    } else {
      return { success: false, error: 'Invalid or expired verification code' };
    }
  } catch (error: any) {
    console.error('Failed to verify code:', error.message);
    return { success: false, error: error.message };
  }
}

// Check if Twilio is properly configured based on current auth mode
export function isTwilioConfigured(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  
  if (!accountSid || !verifyServiceSid) return false;
  
  if (useAuthTokenMode()) {
    // Auth Token mode requires TWILIO_AUTH_TOKEN
    return !!process.env.TWILIO_AUTH_TOKEN;
  } else {
    // API Key mode requires all three credentials
    return !!(process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET);
  }
}

// Send SMS message via Twilio Messages API (NOT Verify)
// Used for follow-up messages, not OTP
export async function sendSms(to: string, body: string): Promise<{ success: boolean; error?: string; sid?: string }> {
  try {
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) {
      return { success: false, error: 'TWILIO_FROM_NUMBER not configured. Set this in Secrets.' };
    }
    
    // Validate and format phone
    const formattedTo = formatToE164(to);
    if (!validateE164Phone(formattedTo)) {
      return { success: false, error: 'Invalid phone number format' };
    }
    
    const client = getTwilioClient();
    
    const message = await client.messages.create({
      to: formattedTo,
      from: fromNumber,
      body: body,
    });
    
    console.log(`SMS sent to ${formattedTo}, SID: ${message.sid}, status: ${message.status}`);
    return { success: true, sid: message.sid };
  } catch (error: any) {
    console.error('Failed to send SMS:', error.message);
    // Handle Twilio trial account limitations
    if (error.code === 21608) {
      return { success: false, error: 'Unverified number. Trial accounts can only send to verified numbers.' };
    }
    return { success: false, error: error.message };
  }
}

// Get diagnostic info (safe - only prefixes and lengths, no full secrets)
export function getTwilioDiagnostics(): {
  authMode: string;
  accountSidPrefix: string;
  apiKeyPrefix: string;
  apiSecretLength: number;
  authTokenLength: number;
  verifyServiceSidPrefix: string;
  configured: boolean;
} {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const apiKey = process.env.TWILIO_API_KEY || '';
  const apiSecret = process.env.TWILIO_API_SECRET || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';
  
  return {
    authMode: getAuthMode(),
    accountSidPrefix: accountSid.substring(0, 2),
    apiKeyPrefix: apiKey.substring(0, 2),
    apiSecretLength: apiSecret.length,
    authTokenLength: authToken.length,
    verifyServiceSidPrefix: verifyServiceSid.substring(0, 2),
    configured: isTwilioConfigured(),
  };
}
