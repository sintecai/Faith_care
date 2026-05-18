import { storage } from "./storage";

// Get current time in Europe/London timezone
function getLondonTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
}

// Get today's month-day in MM-DD format for Europe/London timezone
function getTodayMonthDay(): string {
  const londonTime = getLondonTime();
  const month = String(londonTime.getMonth() + 1).padStart(2, '0');
  const day = String(londonTime.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

// Format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

// Track if we've already run today's celebration check
let lastCelebrationCheckDate: string | null = null;

// Check all churches for celebrations and log them
async function checkCelebrationsForAllChurches() {
  const todayMonthDay = getTodayMonthDay();
  const londonTime = getLondonTime();
  const todayFormatted = formatDate(londonTime);
  const todayDateStr = londonTime.toISOString().split('T')[0];
  
  // Only run once per day
  if (lastCelebrationCheckDate === todayDateStr) {
    return;
  }
  
  console.log(`[SCHEDULER] Running daily celebration check for ${todayFormatted}`);
  
  try {
    // Get all churches
    const churches = await storage.getChurches();
    
    for (const church of churches) {
      const celebrations = await storage.getMembersWithCelebrationsToday(church.id, todayMonthDay);
      const totalCount = celebrations.birthdays.length + celebrations.anniversaries.length;
      
      if (totalCount > 0) {
        console.log(`[SCHEDULER] Church "${church.name}" has ${totalCount} celebration(s) today:`);
        
        if (celebrations.birthdays.length > 0) {
          console.log(`  Birthdays (${celebrations.birthdays.length}):`);
          for (const member of celebrations.birthdays) {
            const age = member.dateOfBirth 
              ? londonTime.getFullYear() - new Date(member.dateOfBirth).getFullYear()
              : '?';
            console.log(`    - ${member.firstName} ${member.lastName} (${member.phone}) - turning ${age}`);
          }
        }
        
        if (celebrations.anniversaries.length > 0) {
          console.log(`  Wedding Anniversaries (${celebrations.anniversaries.length}):`);
          for (const member of celebrations.anniversaries) {
            const years = member.weddingAnniversary
              ? londonTime.getFullYear() - new Date(member.weddingAnniversary).getFullYear()
              : '?';
            console.log(`    - ${member.firstName} ${member.lastName} (${member.phone}) - ${years} year(s)`);
          }
        }
      }
    }
    
    lastCelebrationCheckDate = todayDateStr;
    console.log(`[SCHEDULER] Celebration check completed for ${todayFormatted}`);
  } catch (error) {
    console.error('[SCHEDULER] Error checking celebrations:', error);
  }
}

// Start the scheduler - check every minute if it's time to run
export function startCelebrationScheduler() {
  console.log('[SCHEDULER] Starting celebration scheduler (runs daily at 08:00 Europe/London)');
  
  // Check every minute
  setInterval(() => {
    const londonTime = getLondonTime();
    const hour = londonTime.getHours();
    const minute = londonTime.getMinutes();
    
    // Run at 08:00
    if (hour === 8 && minute === 0) {
      checkCelebrationsForAllChurches();
    }
  }, 60000); // Check every minute
  
  // Also run immediately on startup (useful for testing)
  const londonTime = getLondonTime();
  console.log(`[SCHEDULER] Current London time: ${londonTime.toLocaleTimeString('en-GB')}`);
  
  // If current time is after 08:00, run immediately for today's check
  if (londonTime.getHours() >= 8) {
    checkCelebrationsForAllChurches();
  }
}

// Export for manual trigger (useful for testing via API)
export { checkCelebrationsForAllChurches };
