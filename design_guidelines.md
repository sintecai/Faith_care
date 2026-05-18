# FaithCare Design Guidelines

## Design Approach

**Selected Approach:** Design System - Material Design inspired
**Rationale:** FaithCare is a utility-focused, data-intensive application requiring clarity, trust, and efficiency. Material Design provides excellent patterns for forms, tables, and dashboards while maintaining accessibility and professionalism appropriate for a religious institution.

**Core Principles:**
- Trust & Simplicity: Clean, uncluttered interfaces that inspire confidence
- Dual Experience: Mobile-first for members, desktop-optimized for admin
- Clarity Over Decoration: Function drives every design decision

## Typography

**Font Family:** Inter (via Google Fonts CDN)
- Primary: Inter (400, 500, 600)
- Headings: Inter (600)

**Hierarchy:**
- Page Titles: text-3xl font-semibold
- Section Headers: text-xl font-semibold
- Card Titles: text-lg font-medium
- Body Text: text-base
- Labels: text-sm font-medium
- Helper Text: text-sm text-gray-600

## Layout System

**Spacing Primitives:** Use Tailwind units of 3, 4, 6, 8, 12
- Component padding: p-4 to p-6
- Section spacing: mb-6 to mb-8
- Card gaps: gap-4 to gap-6
- Form field spacing: space-y-4

**Grid Structure:**
- Member pages: Single column, max-w-md centered
- Admin dashboard: 12-column grid with max-w-7xl
- Admin lists/tables: Full-width with max-w-7xl
- Forms: max-w-2xl centered

## Component Library

### Member Flow Components

**Login/Verify Pages:**
- Centered card layout (max-w-md)
- Church logo/name at top
- Clean form with generous spacing (space-y-4)
- Single prominent CTA button
- Minimal text, clear instructions

**Member Home:**
- Two large action tiles in vertical stack
- Each tile: Rounded card with icon, title, brief description
- Tiles use full width on mobile
- Clear visual hierarchy: Icon (top) → Title → Description → Arrow/Indicator

**Attendance Confirmation:**
- Success state with checkmark icon
- Event details in simple card
- Confirmation message
- "Done" button to return home

**Prayer Request Form:**
- Clean vertical form layout
- Priest dropdown (if multiple)
- Large textarea (min-h-32)
- Unit auto-displayed as read-only field
- Submit button at bottom

### Admin Flow Components

**Admin Dashboard:**
- 4-column stat cards (grid-cols-4 on desktop, grid-cols-2 on tablet, grid-cols-1 on mobile)
- Each stat card: Number (large, text-3xl) + Label (text-sm)
- Recent activity section below stats
- Quick actions in sidebar or top bar

**Data Tables:**
- Striped rows for readability
- Sticky header on scroll
- Action buttons (Edit/View) in last column
- Search/filter bar above table
- Pagination at bottom

**Member Management:**
- List view with search bar
- Cards showing: Name, Phone, Unit, Status
- "Add Member" button (top right)
- Edit/view actions per row

**Event Management:**
- Event cards showing: Date, Time, Attendance count
- Status badges (Open/Closed)
- "Open Attendance" and "Close" action buttons
- QR code display modal when opened

**Prayer Request Management:**
- Card layout with request text preview
- Status badges (New/Accepted/Closed)
- Priest assignment dropdown
- Action buttons (Accept/Close)

### Forms

**Structure:**
- Labels above inputs (font-medium text-sm)
- Input fields with border and focus states
- Helper text below inputs when needed
- Error states in red
- Generous spacing (space-y-4)

**Buttons:**
- Primary: Solid background, rounded
- Secondary: Outline style
- Sizes: px-4 py-2 (standard), px-6 py-3 (large)

**Input Fields:**
- Text inputs: border, rounded, px-3 py-2
- Select dropdowns: Matching style to text inputs
- Textareas: min-h-32 for prayer requests

## Navigation

**Member Navigation:**
- Simple top bar with church name and logout
- No complex menus - single-page actions

**Admin Navigation:**
- Left sidebar (desktop) or hamburger menu (mobile)
- Sections: Dashboard, Members, Events, Prayers, Dues
- Active state clearly indicated

## Icons

**Library:** Heroicons (via CDN)
- Use outline icons primarily
- Solid icons for active states and emphasis
- Icons in stat cards, action buttons, navigation

## Responsive Behavior

**Breakpoints:**
- Mobile: Default (< 768px) - Single column, full-width cards
- Tablet: md: (768px+) - Two columns where appropriate
- Desktop: lg: (1024px+) - Full multi-column layouts

**Member Pages:** Always mobile-first, centered, single column
**Admin Pages:** Responsive grids that collapse gracefully

## Images

**Church Logo/Branding:**
- Place church logo/name prominently on member login/home pages
- Simple, trustworthy presentation
- No large hero images - this is a utility app focused on clarity and speed

## Accessibility

- All form inputs have associated labels
- Focus states visible on all interactive elements
- Sufficient spacing for touch targets (min 44px)
- Clear error messages
- Consistent tab order