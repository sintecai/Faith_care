export interface MessageTemplate {
  key: string;
  text: string;
  preview: string;
}

export const followUpTemplates: MessageTemplate[] = [
  {
    key: "missed_1",
    text: "Hi {{name}}, we missed you at today's meeting. Hope everything is okay. Please let us know if you need prayer or support.",
    preview: "Hi {{name}}, we missed you at today's meeting. Hope everything..."
  },
  {
    key: "missed_2",
    text: "Hello {{name}}, just checking in—we noticed you couldn't make it to the meeting. You were missed.",
    preview: "Hello {{name}}, just checking in—we noticed you couldn't..."
  },
  {
    key: "missed_3",
    text: "Dear {{name}}, hope you are doing well. We missed seeing you at the meeting today.",
    preview: "Dear {{name}}, hope you are doing well. We missed seeing..."
  },
  {
    key: "missed_4",
    text: "Hi {{name}}, just a gentle note to say we missed you at the meeting. Is everything alright?",
    preview: "Hi {{name}}, just a gentle note to say we missed you at..."
  },
  {
    key: "missed_5",
    text: "Hello {{name}}, we missed you at today's gathering. We're keeping you in our prayers.",
    preview: "Hello {{name}}, we missed you at today's gathering. We're..."
  },
  {
    key: "missed_6",
    text: "Dear {{name}}, you were missed at the meeting today. Hope all is well with you and your family.",
    preview: "Dear {{name}}, you were missed at the meeting today. Hope..."
  },
  {
    key: "missed_7",
    text: "Hi {{name}}, just reaching out to check in after today's meeting. We missed you.",
    preview: "Hi {{name}}, just reaching out to check in after today's..."
  },
  {
    key: "missed_8",
    text: "Hello {{name}}, we noticed you weren't able to attend today's meeting. Hope everything is okay.",
    preview: "Hello {{name}}, we noticed you weren't able to attend..."
  },
  {
    key: "missed_9",
    text: "Dear {{name}}, sending love—we missed you at the meeting today.",
    preview: "Dear {{name}}, sending love—we missed you at the meeting..."
  },
  {
    key: "missed_10",
    text: "Hi {{name}}, we missed you at today's meeting. Let us know if there's anything we can pray for.",
    preview: "Hi {{name}}, we missed you at today's meeting. Let us know..."
  },
  {
    key: "missed_11",
    text: "Hello {{name}}, hope you're doing well. We missed seeing you at the meeting.",
    preview: "Hello {{name}}, hope you're doing well. We missed seeing..."
  },
  {
    key: "missed_12",
    text: "Dear {{name}}, we missed you at today's meeting and wanted to check in with you.",
    preview: "Dear {{name}}, we missed you at today's meeting and wanted..."
  },
  {
    key: "missed_13",
    text: "Hi {{name}}, just checking in after the meeting today—we missed you.",
    preview: "Hi {{name}}, just checking in after the meeting today—we..."
  },
  {
    key: "missed_14",
    text: "Hello {{name}}, hope all is well. You were missed at today's meeting.",
    preview: "Hello {{name}}, hope all is well. You were missed at..."
  },
  {
    key: "missed_15",
    text: "Dear {{name}}, we noticed you weren't at the meeting today. Hope everything is okay.",
    preview: "Dear {{name}}, we noticed you weren't at the meeting today..."
  },
  {
    key: "missed_16",
    text: "Hi {{name}}, thinking of you and hoping you're well. We missed your presence at the meeting.",
    preview: "Hi {{name}}, thinking of you and hoping you're well..."
  },
  {
    key: "missed_17",
    text: "Hello {{name}}, the fellowship wasn't the same without you. Hope to see you next time!",
    preview: "Hello {{name}}, the fellowship wasn't the same without..."
  },
  {
    key: "missed_18",
    text: "Dear {{name}}, just wanted you to know you were in our thoughts. We missed you today.",
    preview: "Dear {{name}}, just wanted you to know you were in our..."
  }
];

// Dues reminder templates (polite monthly contribution reminders)
export const duesReminderTemplates: MessageTemplate[] = [
  {
    key: "dues_1",
    text: "Hi {{name}}, this is a gentle reminder that {{family}}'s monthly contribution for {{month}} is pending. If already paid, please ignore. Thank you.",
    preview: "Hi {{name}}, this is a gentle reminder that {{family}}'s..."
  },
  {
    key: "dues_2",
    text: "Hello {{name}}, just a friendly reminder about the monthly contribution for {{family}}. Please let us know if you need any assistance.",
    preview: "Hello {{name}}, just a friendly reminder about the monthly..."
  },
  {
    key: "dues_3",
    text: "Dear {{name}}, we're sending a gentle reminder regarding {{family}}'s contribution for {{month}}. Thank you for your continued support.",
    preview: "Dear {{name}}, we're sending a gentle reminder regarding..."
  },
  {
    key: "dues_4",
    text: "Hi {{name}}, a quick reminder about {{family}}'s monthly contribution. We truly appreciate your support.",
    preview: "Hi {{name}}, a quick reminder about {{family}}'s monthly..."
  },
  {
    key: "dues_5",
    text: "Hello {{name}}, hope you are doing well. This is a kind reminder about the monthly contribution for {{family}}.",
    preview: "Hello {{name}}, hope you are doing well. This is a kind..."
  },
  {
    key: "dues_6",
    text: "Dear {{name}}, just a small reminder regarding {{family}}'s contribution for this month. Thank you and God bless.",
    preview: "Dear {{name}}, just a small reminder regarding {{family}}'s..."
  },
  {
    key: "dues_7",
    text: "Hi {{name}}, we wanted to gently remind you about the monthly contribution for {{family}}. Please ignore if already settled.",
    preview: "Hi {{name}}, we wanted to gently remind you about the monthly..."
  },
  {
    key: "dues_8",
    text: "Hello {{name}}, a friendly reminder that {{family}}'s contribution for {{month}} is pending. Thank you for your generosity.",
    preview: "Hello {{name}}, a friendly reminder that {{family}}'s..."
  },
  {
    key: "dues_9",
    text: "Dear {{name}}, sending a gentle reminder about {{family}}'s monthly contribution. We appreciate your support.",
    preview: "Dear {{name}}, sending a gentle reminder about {{family}}'s..."
  },
  {
    key: "dues_10",
    text: "Hi {{name}}, just checking in with a reminder about {{family}}'s contribution for this month.",
    preview: "Hi {{name}}, just checking in with a reminder about..."
  },
  {
    key: "dues_11",
    text: "Hello {{name}}, hope all is well. This is a gentle reminder about the monthly contribution for {{family}}.",
    preview: "Hello {{name}}, hope all is well. This is a gentle reminder..."
  },
  {
    key: "dues_12",
    text: "Dear {{name}}, thank you for being part of our community. A kind reminder about {{family}}'s contribution for {{month}}.",
    preview: "Dear {{name}}, thank you for being part of our community..."
  },
  {
    key: "dues_13",
    text: "Hi {{name}}, a small reminder regarding the monthly contribution for {{family}}. Thank you for your support.",
    preview: "Hi {{name}}, a small reminder regarding the monthly..."
  },
  {
    key: "dues_14",
    text: "Hello {{name}}, this is a friendly reminder about {{family}}'s monthly contribution. Please let us know if you have any concerns.",
    preview: "Hello {{name}}, this is a friendly reminder about {{family}}'s..."
  },
  {
    key: "dues_15",
    text: "Dear {{name}}, we appreciate your commitment. Just a gentle reminder about {{family}}'s contribution for {{month}}.",
    preview: "Dear {{name}}, we appreciate your commitment. Just a gentle..."
  }
];

export function getTemplateByKey(key: string): MessageTemplate | undefined {
  return followUpTemplates.find(t => t.key === key);
}

export function getDuesTemplateByKey(key: string): MessageTemplate | undefined {
  return duesReminderTemplates.find(t => t.key === key);
}

export function renderTemplate(templateText: string, memberName: string): string {
  return templateText.replace(/\{\{name\}\}/g, memberName);
}

export function renderDuesTemplate(templateText: string, memberName: string, familyName: string, monthName?: string): string {
  const currentMonth = monthName || new Date().toLocaleString('en-US', { month: 'long' });
  return templateText
    .replace(/\{\{name\}\}/g, memberName)
    .replace(/\{\{family\}\}/g, familyName)
    .replace(/\{\{month\}\}/g, currentMonth);
}
