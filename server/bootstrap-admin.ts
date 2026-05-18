import bcrypt from "bcrypt";
import { db } from "./db";
import { staffAccounts, churches } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;

export async function bootstrapAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminEmail || !adminPassword) {
    console.log("[BOOTSTRAP] ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin bootstrap");
    return;
  }
  
  try {
    // Get the first church (or create one if none exists)
    let churchList = await db.select().from(churches).limit(1);
    let church = churchList[0];
    
    if (!church) {
      // Create a default church if none exists
      const result = await db.insert(churches).values({
        name: "HFNI Church",
        address: "",
        phone: "",
      }).returning();
      church = result[0];
      console.log("[BOOTSTRAP] Created default church:", church.name);
    }
    
    // Hash the password with bcrypt
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    
    // Check if admin with this email already exists
    const existingStaff = await db.select()
      .from(staffAccounts)
      .where(and(
        eq(staffAccounts.email, adminEmail),
        eq(staffAccounts.churchId, church.id)
      ))
      .limit(1);
    
    if (existingStaff.length > 0) {
      // Update existing admin's password
      await db.update(staffAccounts)
        .set({ 
          passwordHash,
          isActive: true,
        })
        .where(eq(staffAccounts.id, existingStaff[0].id));
      console.log(`[BOOTSTRAP] Admin bootstrap ensured - updated existing admin: ${adminEmail}`);
    } else {
      // Create new admin account
      await db.insert(staffAccounts).values({
        churchId: church.id,
        email: adminEmail,
        passwordHash,
        name: "Admin",
        role: "admin",
        isActive: true,
      });
      console.log(`[BOOTSTRAP] Admin bootstrap ensured - created admin: ${adminEmail}`);
    }
  } catch (error) {
    console.error("[BOOTSTRAP] Error bootstrapping admin:", error);
  }
}

// Verify password - supports both bcrypt and SHA256 (for backward compatibility)
export async function verifyAdminPassword(password: string, hash: string): Promise<boolean> {
  // Check if hash looks like bcrypt (starts with $2a$, $2b$, or $2y$)
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return bcrypt.compare(password, hash);
  }
  
  // Fall back to SHA256 for legacy passwords
  const { createHash } = await import("crypto");
  const sha256Hash = createHash("sha256").update(password).digest("hex");
  return sha256Hash === hash;
}
