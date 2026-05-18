import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Churches table - multi-tenant root
export const churches = pgTable("churches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
});

// Units table - church units/groups
export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
});

// Members table
export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  unitId: varchar("unit_id").references(() => units.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  county: text("county"),
  postcode: text("postcode"),
  country: text("country").default("UK"),
  isActive: boolean("is_active").default(true),
  smsConsent: boolean("sms_consent").default(true),
  duesIsEnabled: boolean("dues_is_enabled").default(false),
  duesAmount: decimal("dues_amount", { precision: 10, scale: 2 }).default("0"),
  duesFrequency: text("dues_frequency").default("monthly"),
  duesNextDueDate: date("dues_next_due_date"),
  passwordHash: text("password_hash"),
  firstLoginTokenHash: text("first_login_token_hash"),
  firstLoginExpiresAt: timestamp("first_login_expires_at"),
  dateOfBirth: date("date_of_birth"),
  weddingAnniversary: date("wedding_anniversary"),
});

// Families table
export const families = pgTable("families", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  unitId: varchar("unit_id").references(() => units.id),
  name: text("name").notNull(),
  address: text("address"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  county: text("county"),
  postcode: text("postcode"),
  country: text("country").default("UK"),
  dueAmount: decimal("due_amount", { precision: 10, scale: 2 }),
  dueFrequency: text("due_frequency").default("monthly"), // monthly, quarterly, annual
  nextDueDate: date("next_due_date"),
  dueNotes: text("due_notes"),
  primaryMemberId: varchar("primary_member_id").references(() => members.id),
  contactPhone: text("contact_phone"),
  contactName: text("contact_name"),
});

// Family members junction table
export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").notNull().references(() => families.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  role: text("role").default("member"),
});

// Pastors table (church pastors/clergy)
export const pastors = pgTable("pastors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  isActive: boolean("is_active").default(true),
});

// Staff accounts table (for admin login)
export const staffAccounts = pgTable("staff_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").default("admin"),
  isActive: boolean("is_active").default(true),
});

// Mass events table
export const massEvents = pgTable("mass_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  title: text("title").notNull(),
  eventDate: timestamp("event_date").notNull(),
  location: text("location"),
  attendanceOpen: boolean("attendance_open").default(false),
  attendanceWindowStart: timestamp("attendance_window_start"),
  attendanceWindowEnd: timestamp("attendance_window_end"),
  qrToken: text("qr_token"),
  checkInCodeHash: text("check_in_code_hash"),
  checkInStatus: text("check_in_status").default("pending"),
});

// Attendance table
export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  eventId: varchar("event_id").notNull().references(() => massEvents.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  status: text("status").default("present"),
  markedAt: timestamp("marked_at").defaultNow(),
  markedByAdmin: boolean("marked_by_admin").default(false),
});

// Prayer requests table
export const prayerRequests = pgTable("prayer_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  pastorId: varchar("pastor_id").references(() => pastors.id),
  unitId: varchar("unit_id").references(() => units.id),
  requestText: text("request_text").notNull(),
  status: text("status").default("new"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dues payments table (legacy - for payment history)
export const duesPayments = pgTable("dues_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  familyId: varchar("family_id").notNull().references(() => families.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at").defaultNow(),
  notes: text("notes"),
});

// Family payments table (tracks monthly payment status)
export const familyPayments = pgTable("family_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  familyId: varchar("family_id").notNull().references(() => families.id),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAt: timestamp("paid_at").defaultNow(),
  paidByStaffId: varchar("paid_by_staff_id").references(() => staffAccounts.id),
});

// Member payments table (tracks monthly payment status for individual members without families)
export const memberPayments = pgTable("member_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAt: timestamp("paid_at").defaultNow(),
  paidByStaffId: varchar("paid_by_staff_id").references(() => staffAccounts.id),
});

// Outbound messages table (for SMS queue)
export const outboundMessages = pgTable("outbound_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  recipientPhone: text("recipient_phone").notNull(),
  messageText: text("message_text").notNull(),
  status: text("status").default("queued"),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  // Added for attendance follow-up messages
  eventId: varchar("event_id").references(() => massEvents.id),
  memberId: varchar("member_id").references(() => members.id),
  templateKey: text("template_key"),
});

// ============================================
// HFNI Connect - New Tables
// ============================================

// Ministry Groups table (TNT, Jesus School, Core Leaders, Elders and Ministers)
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
});

// Member-Group mapping (many-to-many)
export const memberGroups = pgTable("member_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").notNull().references(() => groups.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
});

// Meetings RSVP table
export const meetingsRsvp = pgTable("meetings_rsvp", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  meetingId: varchar("meeting_id").notNull().references(() => massEvents.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  status: text("status").default("going"), // going, maybe, not_going
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Announcements table
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").references(() => groups.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  priority: text("priority").default("normal"), // normal, urgent
  createdAt: timestamp("created_at").defaultNow(),
  createdByStaffId: varchar("created_by_staff_id").references(() => staffAccounts.id),
  smsBroadcastSentAt: timestamp("sms_broadcast_sent_at"),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").references(() => groups.id),
  unitId: varchar("unit_id").references(() => units.id),
  memberId: varchar("member_id").references(() => members.id), // Target member for personal notifications
  familyId: varchar("family_id").references(() => families.id), // Target family for family notifications
  conversationId: varchar("conversation_id"), // Link to conversation for replies (no FK to avoid circular ref)
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").default("general"), // general, announcement, care_followup, dues_reminder
  createdAt: timestamp("created_at").defaultNow(),
  createdByStaffId: varchar("created_by_staff_id").references(() => staffAccounts.id),
});

// Notification reads table (tracks which members have read notifications)
export const notificationReads = pgTable("notification_reads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationId: varchar("notification_id").notNull().references(() => notifications.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  readAt: timestamp("read_at").defaultNow(),
});

// Conversations table (for member inbox/replies)
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  subject: text("subject").notNull(),
  memberId: varchar("member_id").references(() => members.id),
  familyId: varchar("family_id").references(() => families.id),
  status: text("status").default("open"), // open, closed
  createdAt: timestamp("created_at").defaultNow(),
  createdByStaffId: varchar("created_by_staff_id").references(() => staffAccounts.id),
});

// Messages table (for conversation threads)
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  senderType: text("sender_type").notNull(), // 'admin' | 'member'
  senderMemberId: varchar("sender_member_id").references(() => members.id),
  senderStaffId: varchar("sender_staff_id").references(() => staffAccounts.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Gallery items table
export const galleryItems = pgTable("gallery_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").references(() => groups.id),
  title: text("title").notNull(),
  mediaType: text("media_type").default("photo"), // photo, video
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").default("general"), // general, tnt, jesus_school, core_leaders, outreach
  createdAt: timestamp("created_at").defaultNow(),
  createdByStaffId: varchar("created_by_staff_id").references(() => staffAccounts.id),
  isActive: boolean("is_active").default(true),
});

// Testimonies table
export const testimonies = pgTable("testimonies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").references(() => groups.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  status: text("status").default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
  reviewedByStaffId: varchar("reviewed_by_staff_id").references(() => staffAccounts.id),
  reviewedAt: timestamp("reviewed_at"),
});

// Volunteer requests table
export const volunteerRequests = pgTable("volunteer_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  groupId: varchar("group_id").references(() => groups.id),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: date("event_date"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  location: text("location"),
  requiredVolunteers: integer("required_volunteers").default(1),
  status: text("status").default("open"), // open, closed
  createdAt: timestamp("created_at").defaultNow(),
  createdByStaffId: varchar("created_by_staff_id").references(() => staffAccounts.id),
});

// Volunteer signups table
export const volunteerSignups = pgTable("volunteer_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  requestId: varchar("request_id").notNull().references(() => volunteerRequests.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  role: text("role"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ride offers table (carpooling)
export const rideOffers = pgTable("ride_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  meetingId: varchar("meeting_id").notNull().references(() => massEvents.id),
  memberId: varchar("member_id").notNull().references(() => members.id),
  pickupArea: text("pickup_area").notNull(),
  seatsAvailable: integer("seats_available").default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").default("open"), // open, closed
});

// Ride requests table
export const rideRequests = pgTable("ride_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  churchId: varchar("church_id").notNull().references(() => churches.id),
  meetingId: varchar("meeting_id").notNull().references(() => massEvents.id),
  requesterId: varchar("requester_id").notNull().references(() => members.id),
  offerId: varchar("offer_id").references(() => rideOffers.id),
  pickupArea: text("pickup_area").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").default("pending"), // pending, accepted, declined
});

// Relations
export const churchesRelations = relations(churches, ({ many }) => ({
  units: many(units),
  members: many(members),
  families: many(families),
  pastors: many(pastors),
  staffAccounts: many(staffAccounts),
  massEvents: many(massEvents),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  church: one(churches, { fields: [units.churchId], references: [churches.id] }),
  members: many(members),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  church: one(churches, { fields: [members.churchId], references: [churches.id] }),
  unit: one(units, { fields: [members.unitId], references: [units.id] }),
  attendance: many(attendance),
  prayerRequests: many(prayerRequests),
}));

export const familiesRelations = relations(families, ({ one, many }) => ({
  church: one(churches, { fields: [families.churchId], references: [churches.id] }),
  familyMembers: many(familyMembers),
  payments: many(duesPayments),
}));

export const massEventsRelations = relations(massEvents, ({ one, many }) => ({
  church: one(churches, { fields: [massEvents.churchId], references: [churches.id] }),
  attendance: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  church: one(churches, { fields: [attendance.churchId], references: [churches.id] }),
  event: one(massEvents, { fields: [attendance.eventId], references: [massEvents.id] }),
  member: one(members, { fields: [attendance.memberId], references: [members.id] }),
}));

export const prayerRequestsRelations = relations(prayerRequests, ({ one }) => ({
  church: one(churches, { fields: [prayerRequests.churchId], references: [churches.id] }),
  member: one(members, { fields: [prayerRequests.memberId], references: [members.id] }),
  pastor: one(pastors, { fields: [prayerRequests.pastorId], references: [pastors.id] }),
  unit: one(units, { fields: [prayerRequests.unitId], references: [units.id] }),
}));

export const pastorsRelations = relations(pastors, ({ one, many }) => ({
  church: one(churches, { fields: [pastors.churchId], references: [churches.id] }),
  prayerRequests: many(prayerRequests),
}));

// Insert schemas
export const insertChurchSchema = createInsertSchema(churches).omit({ id: true });
export const insertUnitSchema = createInsertSchema(units).omit({ id: true });
export const insertMemberSchema = createInsertSchema(members).omit({ id: true });
export const insertFamilySchema = createInsertSchema(families).omit({ id: true });
export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({ id: true });
export const insertPastorSchema = createInsertSchema(pastors).omit({ id: true });
export const insertStaffAccountSchema = createInsertSchema(staffAccounts).omit({ id: true });
export const insertMassEventSchema = createInsertSchema(massEvents).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertPrayerRequestSchema = createInsertSchema(prayerRequests).omit({ id: true });
export const insertDuesPaymentSchema = createInsertSchema(duesPayments).omit({ id: true });
export const insertFamilyPaymentSchema = createInsertSchema(familyPayments).omit({ id: true });
export const insertMemberPaymentSchema = createInsertSchema(memberPayments).omit({ id: true });
export const insertOutboundMessageSchema = createInsertSchema(outboundMessages).omit({ id: true });

// HFNI Connect - Insert schemas for new tables
export const insertGroupSchema = createInsertSchema(groups).omit({ id: true });
export const insertMemberGroupSchema = createInsertSchema(memberGroups).omit({ id: true });
export const insertMeetingsRsvpSchema = createInsertSchema(meetingsRsvp).omit({ id: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export const insertNotificationReadSchema = createInsertSchema(notificationReads).omit({ id: true });
export const insertGalleryItemSchema = createInsertSchema(galleryItems).omit({ id: true });
export const insertTestimonySchema = createInsertSchema(testimonies).omit({ id: true });
export const insertVolunteerRequestSchema = createInsertSchema(volunteerRequests).omit({ id: true });
export const insertVolunteerSignupSchema = createInsertSchema(volunteerSignups).omit({ id: true });
export const insertRideOfferSchema = createInsertSchema(rideOffers).omit({ id: true });
export const insertRideRequestSchema = createInsertSchema(rideRequests).omit({ id: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });

// Types
export type Church = typeof churches.$inferSelect;
export type InsertChurch = z.infer<typeof insertChurchSchema>;
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Family = typeof families.$inferSelect;
export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type Pastor = typeof pastors.$inferSelect;
export type InsertPastor = z.infer<typeof insertPastorSchema>;
export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = z.infer<typeof insertStaffAccountSchema>;
export type MassEvent = typeof massEvents.$inferSelect;
export type InsertMassEvent = z.infer<typeof insertMassEventSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type PrayerRequest = typeof prayerRequests.$inferSelect;
export type InsertPrayerRequest = z.infer<typeof insertPrayerRequestSchema>;
export type DuesPayment = typeof duesPayments.$inferSelect;
export type InsertDuesPayment = z.infer<typeof insertDuesPaymentSchema>;
export type FamilyPayment = typeof familyPayments.$inferSelect;
export type InsertFamilyPayment = z.infer<typeof insertFamilyPaymentSchema>;
export type MemberPayment = typeof memberPayments.$inferSelect;
export type InsertMemberPayment = z.infer<typeof insertMemberPaymentSchema>;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type InsertOutboundMessage = z.infer<typeof insertOutboundMessageSchema>;

// HFNI Connect - Types for new tables
export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type MemberGroup = typeof memberGroups.$inferSelect;
export type InsertMemberGroup = z.infer<typeof insertMemberGroupSchema>;
export type MeetingsRsvp = typeof meetingsRsvp.$inferSelect;
export type InsertMeetingsRsvp = z.infer<typeof insertMeetingsRsvpSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationRead = typeof notificationReads.$inferSelect;
export type InsertNotificationRead = z.infer<typeof insertNotificationReadSchema>;
export type GalleryItem = typeof galleryItems.$inferSelect;
export type InsertGalleryItem = z.infer<typeof insertGalleryItemSchema>;
export type Testimony = typeof testimonies.$inferSelect;
export type InsertTestimony = z.infer<typeof insertTestimonySchema>;
export type VolunteerRequest = typeof volunteerRequests.$inferSelect;
export type InsertVolunteerRequest = z.infer<typeof insertVolunteerRequestSchema>;
export type VolunteerSignup = typeof volunteerSignups.$inferSelect;
export type InsertVolunteerSignup = z.infer<typeof insertVolunteerSignupSchema>;
export type RideOffer = typeof rideOffers.$inferSelect;
export type InsertRideOffer = z.infer<typeof insertRideOfferSchema>;
export type RideRequest = typeof rideRequests.$inferSelect;
export type InsertRideRequest = z.infer<typeof insertRideRequestSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
