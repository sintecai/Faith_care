import { eq, and, desc, gte, lte, sql, or, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  churches, units, members, families, familyMembers, pastors,
  staffAccounts, massEvents, attendance, prayerRequests, duesPayments,
  familyPayments, memberPayments, outboundMessages, groups, memberGroups,
  announcements, notifications, notificationReads, galleryItems,
  testimonies, volunteerRequests, volunteerSignups, rideOffers, rideRequests,
  conversations, messages,
  type Church, type InsertChurch,
  type Unit, type InsertUnit,
  type Member, type InsertMember,
  type Family, type InsertFamily,
  type FamilyMember, type InsertFamilyMember,
  type Pastor, type InsertPastor,
  type StaffAccount, type InsertStaffAccount,
  type MassEvent, type InsertMassEvent,
  type Attendance, type InsertAttendance,
  type PrayerRequest, type InsertPrayerRequest,
  type DuesPayment, type InsertDuesPayment,
  type FamilyPayment, type InsertFamilyPayment,
  type MemberPayment, type InsertMemberPayment,
  type OutboundMessage, type InsertOutboundMessage,
  type Group, type InsertGroup,
  type MemberGroup, type InsertMemberGroup,
  type Announcement, type InsertAnnouncement,
  type Notification, type InsertNotification,
  type NotificationRead, type InsertNotificationRead,
  type GalleryItem, type InsertGalleryItem,
  type Testimony, type InsertTestimony,
  type VolunteerRequest, type InsertVolunteerRequest,
  type VolunteerSignup, type InsertVolunteerSignup,
  type RideOffer, type InsertRideOffer,
  type RideRequest, type InsertRideRequest,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
} from "@shared/schema";

export interface IStorage {
  // Churches
  getChurch(id: string): Promise<Church | undefined>;
  getFirstChurch(): Promise<Church | undefined>;
  getChurches(): Promise<Church[]>;
  createChurch(church: InsertChurch): Promise<Church>;
  updateChurch(id: string, data: Partial<InsertChurch>): Promise<Church | undefined>;
  deleteChurch(id: string): Promise<boolean>;
  
  // Units
  getUnits(churchId: string): Promise<Unit[]>;
  getUnit(id: string, churchId: string): Promise<Unit | undefined>;
  createUnit(unit: InsertUnit): Promise<Unit>;
  updateUnit(id: string, churchId: string, data: Partial<InsertUnit>): Promise<Unit | undefined>;
  deleteUnit(id: string, churchId: string): Promise<boolean>;
  
  // Members
  getMembers(churchId: string): Promise<Member[]>;
  getMember(id: string, churchId: string): Promise<Member | undefined>;
  getMemberByPhone(phone: string, churchId: string): Promise<Member | undefined>;
  getMemberByFirstLoginToken(tokenHash: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, churchId: string, data: Partial<InsertMember>): Promise<Member | undefined>;
  updateMemberPasswordFields(id: string, churchId: string, data: { passwordHash?: string | null; firstLoginTokenHash?: string | null; firstLoginExpiresAt?: Date | null }): Promise<Member | undefined>;
  deleteMember(id: string, churchId: string): Promise<boolean>;
  searchMembers(churchId: string, query: string): Promise<Member[]>;
  getMemberCount(churchId: string): Promise<number>;
  getActiveMemberCount(churchId: string): Promise<number>;
  getMembersWithCelebrationsToday(churchId: string, monthDay: string): Promise<{ birthdays: Member[]; anniversaries: Member[] }>;
  
  // Families
  getFamilies(churchId: string): Promise<Family[]>;
  getFamily(id: string, churchId: string): Promise<Family | undefined>;
  createFamily(family: InsertFamily): Promise<Family>;
  updateFamily(id: string, churchId: string, data: Partial<InsertFamily>): Promise<Family | undefined>;
  deleteFamily(id: string, churchId: string): Promise<boolean>;
  getFamiliesWithDuesDue(churchId: string, daysAhead: number): Promise<Family[]>;
  getFamiliesWithOverdueDues(churchId: string): Promise<Family[]>;
  getFamilyContact(familyId: string, churchId: string): Promise<Member | null>;
  countDuesRemindersThisMonth(familyId: string, churchId: string): Promise<number>;
  countMemberDuesRemindersThisMonth(memberId: string, churchId: string): Promise<number>;
  
  // Pastors
  getPastors(churchId: string): Promise<Pastor[]>;
  getPastor(id: string, churchId: string): Promise<Pastor | undefined>;
  createPastor(pastor: InsertPastor): Promise<Pastor>;
  updatePastor(id: string, churchId: string, data: Partial<InsertPastor>): Promise<Pastor | undefined>;
  deletePastor(id: string, churchId: string): Promise<boolean>;
  
  // Staff Accounts
  getStaffByEmail(email: string, churchId: string): Promise<StaffAccount | undefined>;
  createStaffAccount(staff: InsertStaffAccount): Promise<StaffAccount>;
  
  // Mass Events
  getMassEvents(churchId: string): Promise<MassEvent[]>;
  getMassEvent(id: string, churchId: string): Promise<MassEvent | undefined>;
  getMassEventByToken(token: string, churchId: string): Promise<MassEvent | undefined>;
  getOpenMassEvent(churchId: string): Promise<MassEvent | undefined>;
  createMassEvent(event: InsertMassEvent): Promise<MassEvent>;
  updateMassEvent(id: string, churchId: string, data: Partial<InsertMassEvent>): Promise<MassEvent | undefined>;
  
  // Meeting Check-In
  startMeetingCheckIn(id: string, churchId: string, codeHash: string): Promise<MassEvent | undefined>;
  endMeetingCheckIn(id: string, churchId: string): Promise<MassEvent | undefined>;
  getActiveMeetings(churchId: string): Promise<MassEvent[]>;
  getMeetingByCheckInCode(codeHash: string, churchId: string): Promise<MassEvent | undefined>;
  
  // Attendance
  getAttendanceForEvent(eventId: string, churchId: string): Promise<Attendance[]>;
  getAttendanceForEventWithMembers(eventId: string, churchId: string): Promise<(Attendance & { member: Member })[]>;
  getAttendanceByMemberAndEvent(memberId: string, eventId: string, churchId: string): Promise<Attendance | undefined>;
  createAttendance(attendance: InsertAttendance): Promise<Attendance>;
  deleteAttendance(id: string, churchId: string): Promise<boolean>;
  getAttendanceCount(eventId: string, churchId: string): Promise<number>;
  
  // Prayer Requests
  getPrayerRequests(churchId: string, status?: string): Promise<PrayerRequest[]>;
  getPrayerRequest(id: string, churchId: string): Promise<PrayerRequest | undefined>;
  createPrayerRequest(request: InsertPrayerRequest): Promise<PrayerRequest>;
  updatePrayerRequest(id: string, churchId: string, data: Partial<InsertPrayerRequest>): Promise<PrayerRequest | undefined>;
  getPrayerRequestCounts(churchId: string): Promise<{ new: number; accepted: number; closed: number }>;
  
  // Dues Payments
  getDuesPayments(churchId: string): Promise<DuesPayment[]>;
  createDuesPayment(payment: InsertDuesPayment): Promise<DuesPayment>;
  
  // Family Payments (monthly payment status)
  getFamilyPayment(churchId: string, familyId: string, year: number, month: number): Promise<FamilyPayment | undefined>;
  markFamilyPaid(churchId: string, familyId: string, year: number, month: number, amount: string, staffId?: string): Promise<FamilyPayment>;
  markFamilyUnpaid(churchId: string, familyId: string, year: number, month: number): Promise<boolean>;
  getFamiliesWithPaymentStatus(churchId: string, year: number, month: number): Promise<(Family & { isPaid: boolean; paymentId?: string })[]>;
  getUnpaidFamilies(churchId: string, year: number, month: number): Promise<Family[]>;
  
  // Member Payments (monthly payment status for individual members)
  getMemberPayment(churchId: string, memberId: string, year: number, month: number): Promise<MemberPayment | undefined>;
  markMemberPaid(churchId: string, memberId: string, year: number, month: number, amount: string, staffId?: string): Promise<MemberPayment>;
  markMemberUnpaid(churchId: string, memberId: string, year: number, month: number): Promise<boolean>;
  getMembersWithDuesEnabled(churchId: string): Promise<Member[]>;
  getMembersWithPaymentStatus(churchId: string, year: number, month: number): Promise<(Member & { isPaid: boolean; paymentId?: string })[]>;
  getUnpaidMembers(churchId: string, year: number, month: number): Promise<Member[]>;
  
  // Outbound Messages
  createOutboundMessage(message: InsertOutboundMessage): Promise<OutboundMessage>;
  checkDuplicateMessage(eventId: string, memberId: string, templateKey: string, churchId: string): Promise<boolean>;
  updateOutboundMessageStatus(id: string, status: string, errorMessage: string | null): Promise<void>;
  
  // Attendance Report
  getAbsenteesForEvent(eventId: string, churchId: string): Promise<Member[]>;
  getAttendeesForEvent(eventId: string, churchId: string): Promise<Member[]>;
  
  // Groups (Ministry Groups)
  getGroups(churchId: string): Promise<Group[]>;
  getGroup(id: string, churchId: string): Promise<Group | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, churchId: string, data: Partial<InsertGroup>): Promise<Group | undefined>;
  deleteGroup(id: string, churchId: string): Promise<boolean>;
  
  // Member Groups (assignments)
  getMemberGroups(groupId: string, churchId: string): Promise<MemberGroup[]>;
  getMembersByGroup(groupId: string, churchId: string): Promise<(Member & { unitName?: string })[]>;
  getGroupsForMember(memberId: string, churchId: string): Promise<Group[]>;
  addMemberToGroup(assignment: InsertMemberGroup): Promise<MemberGroup>;
  removeMemberFromGroup(groupId: string, memberId: string, churchId: string): Promise<boolean>;
  
  // Extended Groups methods
  getGroupsWithMemberCount(churchId: string, filter?: 'active' | 'archived' | 'all'): Promise<(Group & { memberCount: number })[]>;
  archiveGroup(id: string, churchId: string): Promise<Group | undefined>;
  restoreGroup(id: string, churchId: string): Promise<Group | undefined>;
  isMemberInGroup(groupId: string, memberId: string, churchId: string): Promise<boolean>;
  
  // Family Members
  getFamilyMembers(familyId: string, churchId: string): Promise<(FamilyMember & { memberName: string; memberPhone: string })[]>;
  addMemberToFamily(familyMember: InsertFamilyMember): Promise<FamilyMember>;
  isMemberInFamily(familyId: string, memberId: string): Promise<boolean>;
  searchMembersForFamily(familyId: string, churchId: string, query: string): Promise<Member[]>;
  updateFamilyMemberRole(familyId: string, memberId: string, role: string): Promise<boolean>;
  removeMemberFromFamily(familyId: string, memberId: string): Promise<boolean>;
  getMembersNotInFamily(familyId: string, churchId: string): Promise<Member[]>;
  
  // Announcements
  getAnnouncements(churchId: string): Promise<Announcement[]>;
  getAnnouncement(id: string, churchId: string): Promise<Announcement | undefined>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: string, churchId: string, data: Partial<InsertAnnouncement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string, churchId: string): Promise<boolean>;
  
  // Notifications
  getNotifications(churchId: string): Promise<Notification[]>;
  getNotification(id: string, churchId: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  deleteNotification(id: string, churchId: string): Promise<boolean>;
  markNotificationRead(notificationId: string, memberId: string): Promise<NotificationRead>;
  getNotificationReads(memberId: string): Promise<NotificationRead[]>;
  getUnreadNotifications(memberId: string, churchId: string): Promise<Notification[]>;
  
  // Gallery
  getGalleryItems(churchId: string): Promise<GalleryItem[]>;
  getGalleryItem(id: string, churchId: string): Promise<GalleryItem | undefined>;
  createGalleryItem(item: InsertGalleryItem): Promise<GalleryItem>;
  updateGalleryItem(id: string, churchId: string, data: Partial<InsertGalleryItem>): Promise<GalleryItem | undefined>;
  deleteGalleryItem(id: string, churchId: string): Promise<boolean>;
  
  // Testimonies
  getTestimonies(churchId: string, status?: string): Promise<Testimony[]>;
  getTestimony(id: string, churchId: string): Promise<Testimony | undefined>;
  createTestimony(testimony: InsertTestimony): Promise<Testimony>;
  updateTestimony(id: string, churchId: string, data: Partial<InsertTestimony>): Promise<Testimony | undefined>;
  deleteTestimony(id: string, churchId: string): Promise<boolean>;
  
  // Volunteer Requests
  getVolunteerRequests(churchId: string, status?: string): Promise<VolunteerRequest[]>;
  getVolunteerRequest(id: string, churchId: string): Promise<VolunteerRequest | undefined>;
  createVolunteerRequest(request: InsertVolunteerRequest): Promise<VolunteerRequest>;
  updateVolunteerRequest(id: string, churchId: string, data: Partial<InsertVolunteerRequest>): Promise<VolunteerRequest | undefined>;
  deleteVolunteerRequest(id: string, churchId: string): Promise<boolean>;
  
  // Volunteer Signups
  getVolunteerSignups(requestId: string, churchId: string): Promise<(VolunteerSignup & { memberName: string })[]>;
  createVolunteerSignup(signup: InsertVolunteerSignup): Promise<VolunteerSignup>;
  deleteVolunteerSignup(id: string, churchId: string): Promise<boolean>;
  
  // Ride Offers
  getRideOffers(meetingId: string, churchId: string): Promise<(RideOffer & { memberName: string })[]>;
  getRideOffer(id: string, churchId: string): Promise<RideOffer | undefined>;
  createRideOffer(offer: InsertRideOffer): Promise<RideOffer>;
  updateRideOffer(id: string, churchId: string, data: Partial<InsertRideOffer>): Promise<RideOffer | undefined>;
  deleteRideOffer(id: string, churchId: string): Promise<boolean>;
  
  // Ride Requests
  getRideRequests(meetingId: string, churchId: string): Promise<(RideRequest & { requesterName: string })[]>;
  getRideRequest(id: string, churchId: string): Promise<RideRequest | undefined>;
  createRideRequest(request: InsertRideRequest): Promise<RideRequest>;
  updateRideRequest(id: string, churchId: string, data: Partial<InsertRideRequest>): Promise<RideRequest | undefined>;
  deleteRideRequest(id: string, churchId: string): Promise<boolean>;
  
  // Conversations
  getConversationsForMember(memberId: string, churchId: string): Promise<Conversation[]>;
  getConversationsForAdmin(churchId: string, status?: string): Promise<(Conversation & { memberName?: string; lastMessage?: string; unreadCount?: number })[]>;
  getConversation(id: string, churchId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, churchId: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  countUnreadConversationsForMember(memberId: string, churchId: string): Promise<number>;
  
  // Messages
  getMessagesForConversation(conversationId: string, churchId: string): Promise<(Message & { senderName?: string })[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getLatestMessageForConversation(conversationId: string): Promise<Message | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Churches
  async getChurch(id: string): Promise<Church | undefined> {
    const [church] = await db.select().from(churches).where(eq(churches.id, id));
    return church;
  }
  
  async getFirstChurch(): Promise<Church | undefined> {
    const [church] = await db.select().from(churches).limit(1);
    return church;
  }
  
  async getChurches(): Promise<Church[]> {
    return db.select().from(churches);
  }
  
  async createChurch(church: InsertChurch): Promise<Church> {
    const [created] = await db.insert(churches).values(church).returning();
    return created;
  }
  
  async updateChurch(id: string, data: Partial<InsertChurch>): Promise<Church | undefined> {
    const [updated] = await db.update(churches).set(data).where(eq(churches.id, id)).returning();
    return updated;
  }
  
  async deleteChurch(id: string): Promise<boolean> {
    const result = await db.delete(churches).where(eq(churches.id, id));
    return true;
  }
  
  // Units
  async getUnits(churchId: string): Promise<Unit[]> {
    return db.select().from(units).where(eq(units.churchId, churchId));
  }
  
  async getUnit(id: string, churchId: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(and(eq(units.id, id), eq(units.churchId, churchId)));
    return unit;
  }
  
  async createUnit(unit: InsertUnit): Promise<Unit> {
    const [created] = await db.insert(units).values(unit).returning();
    return created;
  }
  
  async updateUnit(id: string, churchId: string, data: Partial<InsertUnit>): Promise<Unit | undefined> {
    const [updated] = await db.update(units).set(data).where(and(eq(units.id, id), eq(units.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteUnit(id: string, churchId: string): Promise<boolean> {
    await db.delete(units).where(and(eq(units.id, id), eq(units.churchId, churchId)));
    return true;
  }
  
  // Get units with member count - filter by active status
  // Security: member join includes church_id filter to ensure tenant isolation
  async getUnitsWithMemberCount(churchId: string, filter: 'active' | 'archived' | 'all' = 'active'): Promise<(Unit & { memberCount: number })[]> {
    const filterCondition = filter === 'active' 
      ? sql`AND u.is_active = true` 
      : filter === 'archived' 
        ? sql`AND u.is_active = false` 
        : sql``;
    
    const result = await db.execute(sql`
      SELECT u.*, COUNT(m.id) AS member_count
      FROM units u
      LEFT JOIN members m ON m.unit_id = u.id AND m.is_active = true AND m.church_id = u.church_id
      WHERE u.church_id = ${churchId}
      ${filterCondition}
      GROUP BY u.id
      ORDER BY lower(u.name)
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      memberCount: parseInt(row.member_count) || 0,
    }));
  }
  
  // Archive a unit (soft delete)
  async archiveUnit(id: string, churchId: string): Promise<Unit | undefined> {
    const [updated] = await db.update(units).set({ isActive: false }).where(and(eq(units.id, id), eq(units.churchId, churchId))).returning();
    return updated;
  }
  
  // Restore an archived unit
  async restoreUnit(id: string, churchId: string): Promise<Unit | undefined> {
    const [updated] = await db.update(units).set({ isActive: true }).where(and(eq(units.id, id), eq(units.churchId, churchId))).returning();
    return updated;
  }
  
  // Check if unit name exists for a church (excluding a specific unit for updates)
  // Uses raw SQL for case-insensitive comparison
  async unitNameExists(name: string, churchId: string, excludeId?: string): Promise<boolean> {
    const result = excludeId
      ? await db.execute(sql`
          SELECT 1 FROM units 
          WHERE church_id = ${churchId} 
          AND lower(name) = lower(${name}) 
          AND id != ${excludeId} 
          LIMIT 1
        `)
      : await db.execute(sql`
          SELECT 1 FROM units 
          WHERE church_id = ${churchId} 
          AND lower(name) = lower(${name}) 
          LIMIT 1
        `);
    return result.rows.length > 0;
  }
  
  // Members
  async getMembers(churchId: string): Promise<Member[]> {
    return db.select().from(members).where(eq(members.churchId, churchId));
  }
  
  async getMember(id: string, churchId: string): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(and(eq(members.id, id), eq(members.churchId, churchId)));
    return member;
  }
  
  async getMemberByPhone(phone: string, churchId: string): Promise<Member | undefined> {
    // Try exact match first, then try with/without + prefix for E.164 compatibility
    const phoneWithPlus = phone.startsWith('+') ? phone : '+' + phone;
    const phoneWithoutPlus = phone.startsWith('+') ? phone.substring(1) : phone;
    
    const [member] = await db.select().from(members).where(
      and(
        eq(members.churchId, churchId),
        or(
          eq(members.phone, phone),
          eq(members.phone, phoneWithPlus),
          eq(members.phone, phoneWithoutPlus)
        )
      )
    );
    return member;
  }
  
  async getMemberByFirstLoginToken(tokenHash: string): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(eq(members.firstLoginTokenHash, tokenHash));
    return member;
  }
  
  async createMember(member: InsertMember): Promise<Member> {
    const [created] = await db.insert(members).values(member).returning();
    return created;
  }
  
  async updateMember(id: string, churchId: string, data: Partial<InsertMember>): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(and(eq(members.id, id), eq(members.churchId, churchId))).returning();
    return updated;
  }
  
  async updateMemberPasswordFields(id: string, churchId: string, data: { passwordHash?: string | null; firstLoginTokenHash?: string | null; firstLoginExpiresAt?: Date | null }): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(and(eq(members.id, id), eq(members.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteMember(id: string, churchId: string): Promise<boolean> {
    await db.delete(members).where(and(eq(members.id, id), eq(members.churchId, churchId)));
    return true;
  }
  
  async searchMembers(churchId: string, query: string): Promise<Member[]> {
    const searchQuery = `%${query.toLowerCase()}%`;
    return db.select().from(members).where(
      and(
        eq(members.churchId, churchId),
        or(
          sql`LOWER(${members.firstName}) LIKE ${searchQuery}`,
          sql`LOWER(${members.lastName}) LIKE ${searchQuery}`,
          sql`${members.phone} LIKE ${searchQuery}`
        )
      )
    );
  }
  
  async getMemberCount(churchId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(eq(members.churchId, churchId));
    return result[0]?.count || 0;
  }
  
  async getActiveMemberCount(churchId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(members).where(and(eq(members.churchId, churchId), eq(members.isActive, true)));
    return result[0]?.count || 0;
  }
  
  async getMembersWithCelebrationsToday(churchId: string, monthDay: string): Promise<{ birthdays: Member[]; anniversaries: Member[] }> {
    // monthDay format: "MM-DD"
    // Get members with birthdays today (matching month and day only)
    const birthdayMembers = await db.select().from(members).where(
      and(
        eq(members.churchId, churchId),
        eq(members.isActive, true),
        sql`to_char(${members.dateOfBirth}, 'MM-DD') = ${monthDay}`
      )
    );
    
    // Get members with anniversaries today (matching month and day only)
    const anniversaryMembers = await db.select().from(members).where(
      and(
        eq(members.churchId, churchId),
        eq(members.isActive, true),
        sql`to_char(${members.weddingAnniversary}, 'MM-DD') = ${monthDay}`
      )
    );
    
    return { birthdays: birthdayMembers, anniversaries: anniversaryMembers };
  }
  
  // Families
  async getFamilies(churchId: string): Promise<Family[]> {
    return db.select().from(families).where(eq(families.churchId, churchId));
  }
  
  async getFamily(id: string, churchId: string): Promise<Family | undefined> {
    const [family] = await db.select().from(families).where(and(eq(families.id, id), eq(families.churchId, churchId)));
    return family;
  }
  
  async createFamily(family: InsertFamily): Promise<Family> {
    const [created] = await db.insert(families).values(family).returning();
    return created;
  }
  
  async updateFamily(id: string, churchId: string, data: Partial<InsertFamily>): Promise<Family | undefined> {
    const [updated] = await db.update(families).set(data).where(and(eq(families.id, id), eq(families.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteFamily(id: string, churchId: string): Promise<boolean> {
    await db.delete(families).where(and(eq(families.id, id), eq(families.churchId, churchId)));
    return true;
  }
  
  async getFamiliesWithDuesDue(churchId: string, daysAhead: number): Promise<Family[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    return db.select().from(families).where(
      and(
        eq(families.churchId, churchId),
        lte(families.nextDueDate, futureDate.toISOString().split('T')[0]),
        gte(families.nextDueDate, new Date().toISOString().split('T')[0])
      )
    );
  }
  
  async getFamiliesWithOverdueDues(churchId: string): Promise<Family[]> {
    const today = new Date().toISOString().split('T')[0];
    return db.select().from(families).where(
      and(
        eq(families.churchId, churchId),
        sql`${families.nextDueDate} < ${today}`
      )
    );
  }
  
  async getFamilyContact(familyId: string, churchId: string): Promise<Member | null> {
    // First try primary member
    const [family] = await db.select().from(families).where(
      and(eq(families.id, familyId), eq(families.churchId, churchId))
    );
    if (!family) return null;
    
    if (family.primaryMemberId) {
      const [primaryMember] = await db.select().from(members).where(
        and(
          eq(members.id, family.primaryMemberId),
          eq(members.churchId, churchId),
          eq(members.smsConsent, true),
          sql`${members.phone} IS NOT NULL AND ${members.phone} != ''`
        )
      );
      if (primaryMember) return primaryMember;
    }
    
    // Fallback: get first family member with sms consent and phone
    const familyMembersList = await db.select({ memberId: familyMembers.memberId })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    
    if (familyMembersList.length === 0) return null;
    
    const memberIds = familyMembersList.map(fm => fm.memberId);
    const [eligibleMember] = await db.select().from(members).where(
      and(
        inArray(members.id, memberIds),
        eq(members.churchId, churchId),
        eq(members.smsConsent, true),
        sql`${members.phone} IS NOT NULL AND ${members.phone} != ''`
      )
    ).limit(1);
    
    return eligibleMember || null;
  }
  
  async countDuesRemindersThisMonth(familyId: string, churchId: string): Promise<number> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pattern = `dues_reminder:${yearMonth}:${familyId}%`;
    
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(outboundMessages)
      .where(
        and(
          eq(outboundMessages.churchId, churchId),
          sql`${outboundMessages.templateKey} LIKE ${pattern}`
        )
      );
    
    return result[0]?.count || 0;
  }
  
  async countMemberDuesRemindersThisMonth(memberId: string, churchId: string): Promise<number> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const pattern = `individual_dues_reminder:${yearMonth}:${memberId}%`;
    
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(outboundMessages)
      .where(
        and(
          eq(outboundMessages.churchId, churchId),
          sql`${outboundMessages.templateKey} LIKE ${pattern}`
        )
      );
    
    return result[0]?.count || 0;
  }
  
  // Pastors
  async getPastors(churchId: string): Promise<Pastor[]> {
    return db.select().from(pastors).where(and(eq(pastors.churchId, churchId), eq(pastors.isActive, true)));
  }
  
  async getPastor(id: string, churchId: string): Promise<Pastor | undefined> {
    const [pastor] = await db.select().from(pastors).where(and(eq(pastors.id, id), eq(pastors.churchId, churchId)));
    return pastor;
  }
  
  async createPastor(pastor: InsertPastor): Promise<Pastor> {
    const [created] = await db.insert(pastors).values(pastor).returning();
    return created;
  }
  
  async updatePastor(id: string, churchId: string, data: Partial<InsertPastor>): Promise<Pastor | undefined> {
    const [updated] = await db.update(pastors).set(data).where(and(eq(pastors.id, id), eq(pastors.churchId, churchId))).returning();
    return updated;
  }
  
  async deletePastor(id: string, churchId: string): Promise<boolean> {
    await db.delete(pastors).where(and(eq(pastors.id, id), eq(pastors.churchId, churchId)));
    return true;
  }
  
  // Staff Accounts
  async getStaffByEmail(email: string, churchId: string): Promise<StaffAccount | undefined> {
    const [staff] = await db.select().from(staffAccounts).where(and(eq(staffAccounts.email, email), eq(staffAccounts.churchId, churchId)));
    return staff;
  }
  
  async createStaffAccount(staff: InsertStaffAccount): Promise<StaffAccount> {
    const [created] = await db.insert(staffAccounts).values(staff).returning();
    return created;
  }
  
  // Mass Events
  async getMassEvents(churchId: string): Promise<MassEvent[]> {
    return db.select().from(massEvents).where(eq(massEvents.churchId, churchId)).orderBy(desc(massEvents.eventDate));
  }
  
  async getMassEvent(id: string, churchId: string): Promise<MassEvent | undefined> {
    const [event] = await db.select().from(massEvents).where(and(eq(massEvents.id, id), eq(massEvents.churchId, churchId)));
    return event;
  }
  
  async getMassEventByToken(token: string, churchId: string): Promise<MassEvent | undefined> {
    const [event] = await db.select().from(massEvents).where(and(eq(massEvents.qrToken, token), eq(massEvents.churchId, churchId)));
    return event;
  }
  
  async getOpenMassEvent(churchId: string): Promise<MassEvent | undefined> {
    const [event] = await db.select().from(massEvents).where(and(eq(massEvents.churchId, churchId), eq(massEvents.attendanceOpen, true)));
    return event;
  }
  
  async createMassEvent(event: InsertMassEvent): Promise<MassEvent> {
    const [created] = await db.insert(massEvents).values(event).returning();
    return created;
  }
  
  async updateMassEvent(id: string, churchId: string, data: Partial<InsertMassEvent>): Promise<MassEvent | undefined> {
    const [updated] = await db.update(massEvents).set(data).where(and(eq(massEvents.id, id), eq(massEvents.churchId, churchId))).returning();
    return updated;
  }
  
  // Meeting Check-In
  async startMeetingCheckIn(id: string, churchId: string, codeHash: string): Promise<MassEvent | undefined> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const [updated] = await db.update(massEvents).set({
      checkInCodeHash: codeHash,
      checkInStatus: 'active',
      attendanceOpen: true,
      attendanceWindowStart: now,
      attendanceWindowEnd: windowEnd,
    }).where(and(eq(massEvents.id, id), eq(massEvents.churchId, churchId))).returning();
    return updated;
  }
  
  async endMeetingCheckIn(id: string, churchId: string): Promise<MassEvent | undefined> {
    const [updated] = await db.update(massEvents).set({
      checkInStatus: 'ended',
      attendanceOpen: false,
    }).where(and(eq(massEvents.id, id), eq(massEvents.churchId, churchId))).returning();
    return updated;
  }
  
  async getActiveMeetings(churchId: string): Promise<MassEvent[]> {
    return db.select().from(massEvents).where(
      and(
        eq(massEvents.churchId, churchId),
        eq(massEvents.checkInStatus, 'active')
      )
    ).orderBy(desc(massEvents.eventDate));
  }
  
  async getMeetingByCheckInCode(codeHash: string, churchId: string): Promise<MassEvent | undefined> {
    const [event] = await db.select().from(massEvents).where(
      and(
        eq(massEvents.checkInCodeHash, codeHash),
        eq(massEvents.churchId, churchId),
        eq(massEvents.checkInStatus, 'active')
      )
    );
    return event;
  }
  
  // Attendance
  async getAttendanceForEvent(eventId: string, churchId: string): Promise<Attendance[]> {
    return db.select().from(attendance).where(and(eq(attendance.eventId, eventId), eq(attendance.churchId, churchId)));
  }
  
  async getAttendanceForEventWithMembers(eventId: string, churchId: string): Promise<(Attendance & { member: Member })[]> {
    const results = await db.select({
      id: attendance.id,
      churchId: attendance.churchId,
      eventId: attendance.eventId,
      memberId: attendance.memberId,
      status: attendance.status,
      markedAt: attendance.markedAt,
      markedByAdmin: attendance.markedByAdmin,
      member: members,
    }).from(attendance)
      .innerJoin(members, eq(attendance.memberId, members.id))
      .where(and(eq(attendance.eventId, eventId), eq(attendance.churchId, churchId)))
      .orderBy(members.firstName, members.lastName);
    return results;
  }
  
  async getAttendanceByMemberAndEvent(memberId: string, eventId: string, churchId: string): Promise<Attendance | undefined> {
    const [att] = await db.select().from(attendance).where(
      and(
        eq(attendance.memberId, memberId),
        eq(attendance.eventId, eventId),
        eq(attendance.churchId, churchId)
      )
    );
    return att;
  }
  
  async createAttendance(att: InsertAttendance): Promise<Attendance> {
    const [created] = await db.insert(attendance).values(att).returning();
    return created;
  }
  
  async deleteAttendance(id: string, churchId: string): Promise<boolean> {
    const result = await db.delete(attendance).where(
      and(eq(attendance.id, id), eq(attendance.churchId, churchId))
    );
    return true;
  }
  
  async getAttendanceCount(eventId: string, churchId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(attendance).where(
      and(eq(attendance.eventId, eventId), eq(attendance.churchId, churchId))
    );
    return result[0]?.count || 0;
  }
  
  // Prayer Requests
  async getPrayerRequests(churchId: string, status?: string): Promise<PrayerRequest[]> {
    if (status) {
      return db.select().from(prayerRequests).where(
        and(eq(prayerRequests.churchId, churchId), eq(prayerRequests.status, status))
      ).orderBy(desc(prayerRequests.createdAt));
    }
    return db.select().from(prayerRequests).where(eq(prayerRequests.churchId, churchId)).orderBy(desc(prayerRequests.createdAt));
  }
  
  async getPrayerRequest(id: string, churchId: string): Promise<PrayerRequest | undefined> {
    const [request] = await db.select().from(prayerRequests).where(and(eq(prayerRequests.id, id), eq(prayerRequests.churchId, churchId)));
    return request;
  }
  
  async createPrayerRequest(request: InsertPrayerRequest): Promise<PrayerRequest> {
    const [created] = await db.insert(prayerRequests).values(request).returning();
    return created;
  }
  
  async updatePrayerRequest(id: string, churchId: string, data: Partial<InsertPrayerRequest>): Promise<PrayerRequest | undefined> {
    const [updated] = await db.update(prayerRequests).set({ ...data, updatedAt: new Date() }).where(
      and(eq(prayerRequests.id, id), eq(prayerRequests.churchId, churchId))
    ).returning();
    return updated;
  }
  
  async getPrayerRequestCounts(churchId: string): Promise<{ new: number; accepted: number; closed: number }> {
    const results = await db.select({
      status: prayerRequests.status,
      count: sql<number>`count(*)::int`
    }).from(prayerRequests).where(eq(prayerRequests.churchId, churchId)).groupBy(prayerRequests.status);
    
    const counts = { new: 0, accepted: 0, closed: 0 };
    results.forEach(r => {
      if (r.status === 'new') counts.new = r.count;
      if (r.status === 'accepted') counts.accepted = r.count;
      if (r.status === 'closed') counts.closed = r.count;
    });
    return counts;
  }
  
  // Dues Payments
  async getDuesPayments(churchId: string): Promise<DuesPayment[]> {
    return db.select().from(duesPayments).where(eq(duesPayments.churchId, churchId)).orderBy(desc(duesPayments.paidAt));
  }
  
  async createDuesPayment(payment: InsertDuesPayment): Promise<DuesPayment> {
    const [created] = await db.insert(duesPayments).values(payment).returning();
    return created;
  }
  
  // Family Payments (monthly payment status)
  async getFamilyPayment(churchId: string, familyId: string, year: number, month: number): Promise<FamilyPayment | undefined> {
    const [payment] = await db.select().from(familyPayments).where(
      and(
        eq(familyPayments.churchId, churchId),
        eq(familyPayments.familyId, familyId),
        eq(familyPayments.periodYear, year),
        eq(familyPayments.periodMonth, month)
      )
    );
    return payment;
  }

  async markFamilyPaid(churchId: string, familyId: string, year: number, month: number, amount: string, staffId?: string): Promise<FamilyPayment> {
    const existing = await this.getFamilyPayment(churchId, familyId, year, month);
    if (existing) {
      const [updated] = await db.update(familyPayments)
        .set({ amount, paidAt: new Date(), paidByStaffId: staffId || null })
        .where(eq(familyPayments.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(familyPayments).values({
      churchId,
      familyId,
      periodYear: year,
      periodMonth: month,
      amount,
      paidByStaffId: staffId || null,
    }).returning();
    return created;
  }

  async markFamilyUnpaid(churchId: string, familyId: string, year: number, month: number): Promise<boolean> {
    await db.delete(familyPayments).where(
      and(
        eq(familyPayments.churchId, churchId),
        eq(familyPayments.familyId, familyId),
        eq(familyPayments.periodYear, year),
        eq(familyPayments.periodMonth, month)
      )
    );
    return true;
  }

  async getFamiliesWithPaymentStatus(churchId: string, year: number, month: number): Promise<(Family & { isPaid: boolean; paymentId?: string })[]> {
    const allFamilies = await db.select().from(families).where(eq(families.churchId, churchId));
    const payments = await db.select().from(familyPayments).where(
      and(
        eq(familyPayments.churchId, churchId),
        eq(familyPayments.periodYear, year),
        eq(familyPayments.periodMonth, month)
      )
    );
    const paymentMap = new Map(payments.map(p => [p.familyId, p.id]));
    return allFamilies.map(f => ({
      ...f,
      isPaid: paymentMap.has(f.id),
      paymentId: paymentMap.get(f.id),
    }));
  }

  async getUnpaidFamilies(churchId: string, year: number, month: number): Promise<Family[]> {
    const familiesWithStatus = await this.getFamiliesWithPaymentStatus(churchId, year, month);
    return familiesWithStatus.filter(f => !f.isPaid);
  }
  
  // Member Payments (monthly payment status for individual members)
  async getMemberPayment(churchId: string, memberId: string, year: number, month: number): Promise<MemberPayment | undefined> {
    const [payment] = await db.select().from(memberPayments).where(
      and(
        eq(memberPayments.churchId, churchId),
        eq(memberPayments.memberId, memberId),
        eq(memberPayments.periodYear, year),
        eq(memberPayments.periodMonth, month)
      )
    );
    return payment;
  }

  async markMemberPaid(churchId: string, memberId: string, year: number, month: number, amount: string, staffId?: string): Promise<MemberPayment> {
    const existing = await this.getMemberPayment(churchId, memberId, year, month);
    if (existing) {
      const [updated] = await db.update(memberPayments)
        .set({ amount, paidAt: new Date(), paidByStaffId: staffId || null })
        .where(eq(memberPayments.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(memberPayments).values({
      churchId,
      memberId,
      periodYear: year,
      periodMonth: month,
      amount,
      paidAt: new Date(),
      paidByStaffId: staffId || null,
    }).returning();
    return created;
  }

  async markMemberUnpaid(churchId: string, memberId: string, year: number, month: number): Promise<boolean> {
    const result = await db.delete(memberPayments).where(
      and(
        eq(memberPayments.churchId, churchId),
        eq(memberPayments.memberId, memberId),
        eq(memberPayments.periodYear, year),
        eq(memberPayments.periodMonth, month)
      )
    );
    return true;
  }

  async getMembersWithDuesEnabled(churchId: string): Promise<Member[]> {
    return db.select().from(members).where(
      and(
        eq(members.churchId, churchId),
        eq(members.isActive, true),
        eq(members.duesIsEnabled, true)
      )
    );
  }

  async getMembersWithPaymentStatus(churchId: string, year: number, month: number): Promise<(Member & { isPaid: boolean; paymentId?: string })[]> {
    const allMembers = await this.getMembersWithDuesEnabled(churchId);
    const payments = await db.select().from(memberPayments).where(
      and(
        eq(memberPayments.churchId, churchId),
        eq(memberPayments.periodYear, year),
        eq(memberPayments.periodMonth, month)
      )
    );
    const paymentMap = new Map(payments.map(p => [p.memberId, p.id]));
    return allMembers.map(m => ({
      ...m,
      isPaid: paymentMap.has(m.id),
      paymentId: paymentMap.get(m.id),
    }));
  }

  async getUnpaidMembers(churchId: string, year: number, month: number): Promise<Member[]> {
    const membersWithStatus = await this.getMembersWithPaymentStatus(churchId, year, month);
    return membersWithStatus.filter(m => !m.isPaid);
  }
  
  // Outbound Messages
  async createOutboundMessage(message: InsertOutboundMessage): Promise<OutboundMessage> {
    const [created] = await db.insert(outboundMessages).values(message).returning();
    return created;
  }
  
  async checkDuplicateMessage(eventId: string, memberId: string, templateKey: string, churchId: string): Promise<boolean> {
    // Build conditions - eventId is optional for announcement broadcasts
    const conditions: any[] = [
      eq(outboundMessages.churchId, churchId),
      eq(outboundMessages.memberId, memberId),
      eq(outboundMessages.templateKey, templateKey)
    ];
    if (eventId) {
      conditions.push(eq(outboundMessages.eventId, eventId));
    }
    
    const [existing] = await db.select()
      .from(outboundMessages)
      .where(and(...conditions))
      .limit(1);
    return !!existing;
  }
  
  async updateOutboundMessageStatus(id: string, status: string, errorMessage: string | null): Promise<void> {
    const updateData: any = { status };
    if (status === 'sent') {
      updateData.sentAt = new Date();
    }
    if (errorMessage !== null) {
      updateData.errorMessage = errorMessage;
    }
    await db.update(outboundMessages).set(updateData).where(eq(outboundMessages.id, id));
  }
  
  // Attendance Report - Get absentees (active members with sms_consent and phone who didn't attend)
  async getAbsenteesForEvent(eventId: string, churchId: string): Promise<Member[]> {
    // Get all member IDs who attended this event
    const attendedIds = await db.select({ memberId: attendance.memberId })
      .from(attendance)
      .where(and(eq(attendance.eventId, eventId), eq(attendance.churchId, churchId)));
    
    const attendedSet = new Set(attendedIds.map(a => a.memberId));
    
    // Get all active members with phone and sms_consent
    const activeMembers = await db.select()
      .from(members)
      .where(and(
        eq(members.churchId, churchId),
        eq(members.isActive, true),
        eq(members.smsConsent, true),
        sql`${members.phone} IS NOT NULL AND ${members.phone} != ''`
      ));
    
    // Filter out those who attended
    return activeMembers.filter(m => !attendedSet.has(m.id));
  }
  
  // Attendance Report - Get attendees with member details
  async getAttendeesForEvent(eventId: string, churchId: string): Promise<Member[]> {
    const attendedIds = await db.select({ memberId: attendance.memberId })
      .from(attendance)
      .where(and(eq(attendance.eventId, eventId), eq(attendance.churchId, churchId)));
    
    if (attendedIds.length === 0) return [];
    
    const memberIds = attendedIds.map(a => a.memberId);
    const attendees = await db.select()
      .from(members)
      .where(and(
        eq(members.churchId, churchId),
        inArray(members.id, memberIds)
      ));
    
    return attendees;
  }
  
  // Groups (Ministry Groups)
  async getGroups(churchId: string): Promise<Group[]> {
    return db.select().from(groups).where(eq(groups.churchId, churchId));
  }
  
  async getGroup(id: string, churchId: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(and(eq(groups.id, id), eq(groups.churchId, churchId)));
    return group;
  }
  
  async createGroup(group: InsertGroup): Promise<Group> {
    const [created] = await db.insert(groups).values(group).returning();
    return created;
  }
  
  async updateGroup(id: string, churchId: string, data: Partial<InsertGroup>): Promise<Group | undefined> {
    const [updated] = await db.update(groups).set(data).where(and(eq(groups.id, id), eq(groups.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteGroup(id: string, churchId: string): Promise<boolean> {
    // First delete all member assignments
    await db.delete(memberGroups).where(and(eq(memberGroups.groupId, id), eq(memberGroups.churchId, churchId)));
    // Then delete the group
    await db.delete(groups).where(and(eq(groups.id, id), eq(groups.churchId, churchId)));
    return true;
  }
  
  // Get groups with member count (only counting active members)
  async getGroupsWithMemberCount(churchId: string, filter: 'active' | 'archived' | 'all' = 'active'): Promise<(Group & { memberCount: number })[]> {
    const filterCondition = filter === 'active' 
      ? sql`AND g.is_active = true` 
      : filter === 'archived' 
        ? sql`AND g.is_active = false` 
        : sql``;
    
    const result = await db.execute(sql`
      SELECT g.*, COUNT(CASE WHEN m.is_active = true THEN mg.id END) AS member_count
      FROM groups g
      LEFT JOIN member_groups mg ON mg.group_id = g.id AND mg.church_id = g.church_id
      LEFT JOIN members m ON mg.member_id = m.id AND mg.church_id = m.church_id
      WHERE g.church_id = ${churchId}
      ${filterCondition}
      GROUP BY g.id
      ORDER BY lower(g.name)
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      memberCount: parseInt(row.member_count) || 0,
    }));
  }
  
  // Archive a group (soft delete)
  async archiveGroup(id: string, churchId: string): Promise<Group | undefined> {
    const [updated] = await db.update(groups).set({ isActive: false }).where(and(eq(groups.id, id), eq(groups.churchId, churchId))).returning();
    return updated;
  }
  
  // Restore an archived group
  async restoreGroup(id: string, churchId: string): Promise<Group | undefined> {
    const [updated] = await db.update(groups).set({ isActive: true }).where(and(eq(groups.id, id), eq(groups.churchId, churchId))).returning();
    return updated;
  }
  
  // Member Groups (assignments)
  async getMemberGroups(groupId: string, churchId: string): Promise<MemberGroup[]> {
    return db.select().from(memberGroups).where(and(eq(memberGroups.groupId, groupId), eq(memberGroups.churchId, churchId)));
  }
  
  async getMembersByGroup(groupId: string, churchId: string): Promise<(Member & { unitName?: string })[]> {
    const result = await db.execute(sql`
      SELECT m.*, u.name as unit_name
      FROM members m
      INNER JOIN member_groups mg ON mg.member_id = m.id AND mg.church_id = m.church_id
      LEFT JOIN units u ON m.unit_id = u.id AND m.church_id = u.church_id
      WHERE mg.group_id = ${groupId} AND mg.church_id = ${churchId} AND m.is_active = true
      ORDER BY m.first_name, m.last_name
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      unitId: row.unit_id,
      unitName: row.unit_name || null,
      isActive: row.is_active,
      dateOfBirth: row.date_of_birth,
    }));
  }
  
  async getGroupsForMember(memberId: string, churchId: string): Promise<Group[]> {
    const result = await db.execute(sql`
      SELECT g.*
      FROM groups g
      INNER JOIN member_groups mg ON mg.group_id = g.id AND mg.church_id = g.church_id
      WHERE mg.member_id = ${memberId} AND mg.church_id = ${churchId} AND g.is_active = true
      ORDER BY g.name
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
    }));
  }
  
  async addMemberToGroup(assignment: InsertMemberGroup): Promise<MemberGroup> {
    const [created] = await db.insert(memberGroups).values(assignment).returning();
    return created;
  }
  
  async removeMemberFromGroup(groupId: string, memberId: string, churchId: string): Promise<boolean> {
    await db.delete(memberGroups).where(
      and(
        eq(memberGroups.groupId, groupId),
        eq(memberGroups.memberId, memberId),
        eq(memberGroups.churchId, churchId)
      )
    );
    return true;
  }
  
  // Check if member is already in a group
  async isMemberInGroup(groupId: string, memberId: string, churchId: string): Promise<boolean> {
    const [existing] = await db.select().from(memberGroups).where(
      and(
        eq(memberGroups.groupId, groupId),
        eq(memberGroups.memberId, memberId),
        eq(memberGroups.churchId, churchId)
      )
    );
    return !!existing;
  }
  
  // Family Members
  async getFamilyMembers(familyId: string, churchId: string): Promise<(FamilyMember & { memberName: string; memberPhone: string })[]> {
    const result = await db.execute(sql`
      SELECT fm.*, m.first_name || ' ' || m.last_name AS member_name, m.phone AS member_phone
      FROM family_members fm
      INNER JOIN members m ON fm.member_id = m.id
      INNER JOIN families f ON fm.family_id = f.id
      WHERE fm.family_id = ${familyId} AND f.church_id = ${churchId}
      ORDER BY m.first_name, m.last_name
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      familyId: row.family_id,
      memberId: row.member_id,
      role: row.role,
      memberName: row.member_name,
      memberPhone: row.member_phone,
    }));
  }
  
  async addMemberToFamily(familyMember: InsertFamilyMember): Promise<FamilyMember> {
    // Check for duplicate - member already in this family
    const existing = await db.select().from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyMember.familyId),
        eq(familyMembers.memberId, familyMember.memberId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      throw new Error("Member is already in this family");
    }
    
    const [created] = await db.insert(familyMembers).values(familyMember).returning();
    return created;
  }
  
  async isMemberInFamily(familyId: string, memberId: string): Promise<boolean> {
    const existing = await db.select().from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.memberId, memberId)
      ))
      .limit(1);
    return existing.length > 0;
  }
  
  async searchMembersForFamily(familyId: string, churchId: string, query: string): Promise<Member[]> {
    const result = await db.execute(sql`
      SELECT m.*
      FROM members m
      WHERE m.church_id = ${churchId} 
      AND m.is_active = true
      AND m.id NOT IN (SELECT member_id FROM family_members WHERE family_id = ${familyId})
      AND (
        LOWER(m.first_name || ' ' || m.last_name) LIKE LOWER(${'%' + query + '%'})
        OR LOWER(m.phone) LIKE LOWER(${'%' + query + '%'})
      )
      ORDER BY m.first_name, m.last_name
      LIMIT 20
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      unitId: row.unit_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      isActive: row.is_active,
      smsConsent: row.sms_consent,
    })) as Member[];
  }
  
  async updateFamilyMemberRole(familyId: string, memberId: string, role: string): Promise<boolean> {
    await db.update(familyMembers)
      .set({ role })
      .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberId, memberId)));
    return true;
  }
  
  async removeMemberFromFamily(familyId: string, memberId: string): Promise<boolean> {
    await db.delete(familyMembers).where(
      and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberId, memberId))
    );
    return true;
  }
  
  async getMembersNotInFamily(familyId: string, churchId: string): Promise<Member[]> {
    const result = await db.execute(sql`
      SELECT m.*
      FROM members m
      WHERE m.church_id = ${churchId} AND m.is_active = true
      AND m.id NOT IN (SELECT member_id FROM family_members WHERE family_id = ${familyId})
      ORDER BY m.first_name, m.last_name
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      unitId: row.unit_id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      isActive: row.is_active,
      smsConsent: row.sms_consent,
    }));
  }
  
  // Announcements
  async getAnnouncements(churchId: string): Promise<Announcement[]> {
    return db.select().from(announcements).where(eq(announcements.churchId, churchId)).orderBy(desc(announcements.createdAt));
  }
  
  async getAnnouncement(id: string, churchId: string): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.churchId, churchId)));
    return announcement;
  }
  
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const [created] = await db.insert(announcements).values(announcement).returning();
    return created;
  }
  
  async updateAnnouncement(id: string, churchId: string, data: Partial<InsertAnnouncement>): Promise<Announcement | undefined> {
    const [updated] = await db.update(announcements).set(data).where(and(eq(announcements.id, id), eq(announcements.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteAnnouncement(id: string, churchId: string): Promise<boolean> {
    await db.delete(announcements).where(and(eq(announcements.id, id), eq(announcements.churchId, churchId)));
    return true;
  }
  
  // Notifications
  async getNotifications(churchId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.churchId, churchId)).orderBy(desc(notifications.createdAt));
  }
  
  async getNotification(id: string, churchId: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.churchId, churchId)));
    return notification;
  }
  
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }
  
  async deleteNotification(id: string, churchId: string): Promise<boolean> {
    await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.churchId, churchId)));
    return true;
  }
  
  async markNotificationRead(notificationId: string, memberId: string): Promise<NotificationRead> {
    const [created] = await db.insert(notificationReads).values({ notificationId, memberId }).returning();
    return created;
  }
  
  async getNotificationReads(memberId: string): Promise<NotificationRead[]> {
    return await db.select().from(notificationReads).where(eq(notificationReads.memberId, memberId));
  }
  
  async getUnreadNotifications(memberId: string, churchId: string): Promise<Notification[]> {
    const result = await db.execute(sql`
      SELECT n.*
      FROM notifications n
      WHERE n.church_id = ${churchId}
      AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE member_id = ${memberId})
      ORDER BY n.created_at DESC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      groupId: row.group_id,
      unitId: row.unit_id,
      memberId: row.member_id,
      familyId: row.family_id,
      conversationId: row.conversation_id,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.created_at,
      createdByStaffId: row.created_by_staff_id,
    }));
  }
  
  // Get notifications visible to a specific member (personal notifications + general announcements)
  async getNotificationsForMember(memberId: string, churchId: string): Promise<(Notification & { isRead: boolean })[]> {
    const result = await db.execute(sql`
      SELECT n.*, 
        CASE WHEN nr.id IS NOT NULL THEN true ELSE false END as is_read
      FROM notifications n
      LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.member_id = ${memberId}
      WHERE n.church_id = ${churchId}
      AND (n.member_id = ${memberId} OR n.member_id IS NULL)
      ORDER BY n.created_at DESC
      LIMIT 100
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      groupId: row.group_id,
      unitId: row.unit_id,
      memberId: row.member_id,
      familyId: row.family_id,
      conversationId: row.conversation_id,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.created_at,
      createdByStaffId: row.created_by_staff_id,
      isRead: row.is_read,
    }));
  }
  
  // Check if notification already exists for member + type + optional context (e.g., event)
  async checkDuplicateNotification(memberId: string, churchId: string, type: string, contextKey?: string): Promise<boolean> {
    // For care followups and dues reminders, check if a notification of same type was sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let query;
    if (contextKey) {
      // Check by type and if body contains context key
      query = await db.select().from(notifications).where(
        and(
          eq(notifications.churchId, churchId),
          eq(notifications.memberId, memberId),
          eq(notifications.type, type),
          sql`${notifications.body} LIKE ${'%' + contextKey + '%'}`,
          sql`${notifications.createdAt} >= ${today}`
        )
      ).limit(1);
    } else {
      query = await db.select().from(notifications).where(
        and(
          eq(notifications.churchId, churchId),
          eq(notifications.memberId, memberId),
          eq(notifications.type, type),
          sql`${notifications.createdAt} >= ${today}`
        )
      ).limit(1);
    }
    return query.length > 0;
  }
  
  // Count unread notifications for a member
  async countUnreadNotifications(memberId: string, churchId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM notifications n
      WHERE n.church_id = ${churchId}
      AND (n.member_id = ${memberId} OR n.member_id IS NULL)
      AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE member_id = ${memberId})
    `);
    return parseInt(result.rows[0]?.count || '0', 10);
  }
  
  // Gallery
  async getGalleryItems(churchId: string): Promise<GalleryItem[]> {
    return db.select().from(galleryItems).where(and(eq(galleryItems.churchId, churchId), eq(galleryItems.isActive, true))).orderBy(desc(galleryItems.createdAt));
  }
  
  async getGalleryItem(id: string, churchId: string): Promise<GalleryItem | undefined> {
    const [item] = await db.select().from(galleryItems).where(and(eq(galleryItems.id, id), eq(galleryItems.churchId, churchId)));
    return item;
  }
  
  async createGalleryItem(item: InsertGalleryItem): Promise<GalleryItem> {
    const [created] = await db.insert(galleryItems).values(item).returning();
    return created;
  }
  
  async updateGalleryItem(id: string, churchId: string, data: Partial<InsertGalleryItem>): Promise<GalleryItem | undefined> {
    const [updated] = await db.update(galleryItems).set(data).where(and(eq(galleryItems.id, id), eq(galleryItems.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteGalleryItem(id: string, churchId: string): Promise<boolean> {
    await db.update(galleryItems).set({ isActive: false }).where(and(eq(galleryItems.id, id), eq(galleryItems.churchId, churchId)));
    return true;
  }
  
  // Testimonies
  async getTestimonies(churchId: string, status?: string): Promise<Testimony[]> {
    if (status) {
      return db.select().from(testimonies).where(and(eq(testimonies.churchId, churchId), eq(testimonies.status, status))).orderBy(desc(testimonies.createdAt));
    }
    return db.select().from(testimonies).where(eq(testimonies.churchId, churchId)).orderBy(desc(testimonies.createdAt));
  }
  
  async getTestimony(id: string, churchId: string): Promise<Testimony | undefined> {
    const [testimony] = await db.select().from(testimonies).where(and(eq(testimonies.id, id), eq(testimonies.churchId, churchId)));
    return testimony;
  }
  
  async createTestimony(testimony: InsertTestimony): Promise<Testimony> {
    const [created] = await db.insert(testimonies).values(testimony).returning();
    return created;
  }
  
  async updateTestimony(id: string, churchId: string, data: Partial<InsertTestimony>): Promise<Testimony | undefined> {
    const [updated] = await db.update(testimonies).set(data).where(and(eq(testimonies.id, id), eq(testimonies.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteTestimony(id: string, churchId: string): Promise<boolean> {
    await db.delete(testimonies).where(and(eq(testimonies.id, id), eq(testimonies.churchId, churchId)));
    return true;
  }
  
  // Volunteer Requests
  async getVolunteerRequests(churchId: string, status?: string): Promise<VolunteerRequest[]> {
    if (status) {
      return db.select().from(volunteerRequests).where(and(eq(volunteerRequests.churchId, churchId), eq(volunteerRequests.status, status))).orderBy(desc(volunteerRequests.createdAt));
    }
    return db.select().from(volunteerRequests).where(eq(volunteerRequests.churchId, churchId)).orderBy(desc(volunteerRequests.createdAt));
  }
  
  async getVolunteerRequest(id: string, churchId: string): Promise<VolunteerRequest | undefined> {
    const [request] = await db.select().from(volunteerRequests).where(and(eq(volunteerRequests.id, id), eq(volunteerRequests.churchId, churchId)));
    return request;
  }
  
  async createVolunteerRequest(request: InsertVolunteerRequest): Promise<VolunteerRequest> {
    const [created] = await db.insert(volunteerRequests).values(request).returning();
    return created;
  }
  
  async updateVolunteerRequest(id: string, churchId: string, data: Partial<InsertVolunteerRequest>): Promise<VolunteerRequest | undefined> {
    const [updated] = await db.update(volunteerRequests).set(data).where(and(eq(volunteerRequests.id, id), eq(volunteerRequests.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteVolunteerRequest(id: string, churchId: string): Promise<boolean> {
    await db.delete(volunteerRequests).where(and(eq(volunteerRequests.id, id), eq(volunteerRequests.churchId, churchId)));
    return true;
  }
  
  // Volunteer Signups
  async getVolunteerSignups(requestId: string, churchId: string): Promise<(VolunteerSignup & { memberName: string })[]> {
    const result = await db.execute(sql`
      SELECT vs.*, m.first_name || ' ' || m.last_name AS member_name
      FROM volunteer_signups vs
      INNER JOIN members m ON vs.member_id = m.id
      WHERE vs.request_id = ${requestId} AND vs.church_id = ${churchId}
      ORDER BY vs.created_at DESC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      requestId: row.request_id,
      memberId: row.member_id,
      role: row.role,
      note: row.note,
      createdAt: row.created_at,
      memberName: row.member_name,
    }));
  }
  
  async createVolunteerSignup(signup: InsertVolunteerSignup): Promise<VolunteerSignup> {
    const [created] = await db.insert(volunteerSignups).values(signup).returning();
    return created;
  }
  
  async deleteVolunteerSignup(id: string, churchId: string): Promise<boolean> {
    await db.delete(volunteerSignups).where(and(eq(volunteerSignups.id, id), eq(volunteerSignups.churchId, churchId)));
    return true;
  }
  
  // Ride Offers
  async getRideOffers(meetingId: string, churchId: string): Promise<(RideOffer & { memberName: string })[]> {
    const result = await db.execute(sql`
      SELECT ro.*, m.first_name || ' ' || m.last_name AS member_name
      FROM ride_offers ro
      INNER JOIN members m ON ro.member_id = m.id
      WHERE ro.meeting_id = ${meetingId} AND ro.church_id = ${churchId}
      ORDER BY ro.created_at DESC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      meetingId: row.meeting_id,
      memberId: row.member_id,
      pickupArea: row.pickup_area,
      seatsAvailable: row.seats_available,
      notes: row.notes,
      createdAt: row.created_at,
      status: row.status,
      memberName: row.member_name,
    }));
  }
  
  async getRideOffer(id: string, churchId: string): Promise<RideOffer | undefined> {
    const [offer] = await db.select().from(rideOffers).where(and(eq(rideOffers.id, id), eq(rideOffers.churchId, churchId)));
    return offer;
  }
  
  async createRideOffer(offer: InsertRideOffer): Promise<RideOffer> {
    const [created] = await db.insert(rideOffers).values(offer).returning();
    return created;
  }
  
  async updateRideOffer(id: string, churchId: string, data: Partial<InsertRideOffer>): Promise<RideOffer | undefined> {
    const [updated] = await db.update(rideOffers).set(data).where(and(eq(rideOffers.id, id), eq(rideOffers.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteRideOffer(id: string, churchId: string): Promise<boolean> {
    await db.delete(rideOffers).where(and(eq(rideOffers.id, id), eq(rideOffers.churchId, churchId)));
    return true;
  }
  
  // Ride Requests
  async getRideRequests(meetingId: string, churchId: string): Promise<(RideRequest & { requesterName: string })[]> {
    const result = await db.execute(sql`
      SELECT rr.*, m.first_name || ' ' || m.last_name AS requester_name
      FROM ride_requests rr
      INNER JOIN members m ON rr.requester_id = m.id
      WHERE rr.meeting_id = ${meetingId} AND rr.church_id = ${churchId}
      ORDER BY rr.created_at DESC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      meetingId: row.meeting_id,
      requesterId: row.requester_id,
      offerId: row.offer_id,
      pickupArea: row.pickup_area,
      notes: row.notes,
      createdAt: row.created_at,
      status: row.status,
      requesterName: row.requester_name,
    }));
  }
  
  async getRideRequest(id: string, churchId: string): Promise<RideRequest | undefined> {
    const [request] = await db.select().from(rideRequests).where(and(eq(rideRequests.id, id), eq(rideRequests.churchId, churchId)));
    return request;
  }
  
  async createRideRequest(request: InsertRideRequest): Promise<RideRequest> {
    const [created] = await db.insert(rideRequests).values(request).returning();
    return created;
  }
  
  async updateRideRequest(id: string, churchId: string, data: Partial<InsertRideRequest>): Promise<RideRequest | undefined> {
    const [updated] = await db.update(rideRequests).set(data).where(and(eq(rideRequests.id, id), eq(rideRequests.churchId, churchId))).returning();
    return updated;
  }
  
  async deleteRideRequest(id: string, churchId: string): Promise<boolean> {
    await db.delete(rideRequests).where(and(eq(rideRequests.id, id), eq(rideRequests.churchId, churchId)));
    return true;
  }
  
  // Conversations
  async getConversationsForMember(memberId: string, churchId: string): Promise<Conversation[]> {
    return db.select()
      .from(conversations)
      .where(and(eq(conversations.churchId, churchId), eq(conversations.memberId, memberId)))
      .orderBy(desc(conversations.createdAt));
  }
  
  async getConversationsForAdmin(churchId: string, status?: string): Promise<(Conversation & { memberName?: string; lastMessage?: string; unreadCount?: number })[]> {
    const result = await db.execute(sql`
      SELECT c.*, 
        m.first_name || ' ' || m.last_name AS member_name,
        (SELECT body FROM messages msg WHERE msg.conversation_id = c.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message
      FROM conversations c
      LEFT JOIN members m ON c.member_id = m.id
      WHERE c.church_id = ${churchId}
      ${status ? sql`AND c.status = ${status}` : sql``}
      ORDER BY c.created_at DESC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      subject: row.subject,
      memberId: row.member_id,
      familyId: row.family_id,
      status: row.status,
      createdAt: row.created_at,
      createdByStaffId: row.created_by_staff_id,
      memberName: row.member_name,
      lastMessage: row.last_message,
    }));
  }
  
  async getConversation(id: string, churchId: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.churchId, churchId)));
    return conversation;
  }
  
  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conversation).returning();
    return created;
  }
  
  async updateConversation(id: string, churchId: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const [updated] = await db.update(conversations).set(data).where(and(eq(conversations.id, id), eq(conversations.churchId, churchId))).returning();
    return updated;
  }
  
  async countUnreadConversationsForMember(memberId: string, churchId: string): Promise<number> {
    // Count conversations where member hasn't read the latest admin message
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT c.id) as count
      FROM conversations c
      INNER JOIN messages m ON m.conversation_id = c.id
      WHERE c.church_id = ${churchId}
        AND c.member_id = ${memberId}
        AND m.sender_type = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM messages m2 
          WHERE m2.conversation_id = c.id 
            AND m2.sender_type = 'member'
            AND m2.created_at > m.created_at
        )
    `);
    return parseInt((result.rows[0] as any)?.count || '0', 10);
  }
  
  // Messages
  async getMessagesForConversation(conversationId: string, churchId: string): Promise<(Message & { senderName?: string })[]> {
    const result = await db.execute(sql`
      SELECT msg.*, 
        CASE 
          WHEN msg.sender_type = 'admin' THEN sa.name
          WHEN msg.sender_type = 'member' THEN m.first_name || ' ' || m.last_name
          ELSE 'Unknown'
        END AS sender_name
      FROM messages msg
      LEFT JOIN staff_accounts sa ON msg.sender_staff_id = sa.id
      LEFT JOIN members m ON msg.sender_member_id = m.id
      WHERE msg.conversation_id = ${conversationId} AND msg.church_id = ${churchId}
      ORDER BY msg.created_at ASC
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      churchId: row.church_id,
      conversationId: row.conversation_id,
      senderType: row.sender_type,
      senderMemberId: row.sender_member_id,
      senderStaffId: row.sender_staff_id,
      body: row.body,
      createdAt: row.created_at,
      senderName: row.sender_name,
    }));
  }
  
  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }
  
  async getLatestMessageForConversation(conversationId: string): Promise<Message | undefined> {
    const [msg] = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return msg;
  }
}

export const storage = new DatabaseStorage();
