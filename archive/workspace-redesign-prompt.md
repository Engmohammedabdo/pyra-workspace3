# Pyra Workspace UI Redesign — Claude Code Prompt

Copy this entire prompt and give it to Claude Code:

---

## 🎯 Task: Redesign Pyra Workspace UI

I have a file manager web app called **Pyra Workspace** hosted at `http://workspeace.pyramedia.info/`. It consists of 3 files:
- `index.php` — HTML structure
- `style.css` — All styles (2,071 lines)
- `app.js` — All JavaScript logic (2,318 lines)

**Backend:** `api.php` — PHP API using Supabase Storage. **DO NOT MODIFY api.php AT ALL.**

The app already works perfectly. I want a **visual/UX redesign only** — no functional changes, no API changes. Everything that works now must continue working identically.

## ⚠️ Critical Rules

1. **DO NOT touch `api.php`** — zero changes to backend
2. **DO NOT change any API calls** in `app.js` — all `apiFetch()` calls, URLs, and data formats must stay identical
3. **DO NOT break existing functionality** — upload, download, preview, edit, delete, rename, create folder, search, users, trash, activity, reviews, share links, notifications — ALL must keep working
4. **Test every change** — if something might break, don't do it
5. **Keep all CSS variables** — update values, add new ones, but don't remove existing ones that are referenced in JS
6. **Backup first** — before editing, copy the original files as `style.css.bak`, `app.js.bak`, `index.php.bak`

## Current Tech Stack
- Pure HTML/CSS/JS (no framework)
- Fonts: Inter, JetBrains Mono, Noto Sans Arabic (Google Fonts)
- Backend: PHP + Supabase Storage API
- Features: Login, file management, preview, reviews, users, trash, share links, notifications, activity log
- RTL support exists for Arabic content

## Current Color Scheme
```css
--accent: #7c6fff;        /* Purple */
--accent-hover: #9185ff;
--bg-primary: #0d1017;    /* Very dark blue-black */
--bg-secondary: #151a23;
--bg-tertiary: #1c2333;
```

---

## Changes Required

### 1. Theme Switcher (Purple ↔ Pyramedia Orange)

Add a **theme toggle button** in the top-bar (near the user name area). Two themes:

**Theme 1 — Midnight (default, current purple):**
```css
--accent: #7c6fff;
--accent-hover: #9185ff;
--accent-bg: rgba(124, 111, 255, 0.1);
--accent-border: rgba(124, 111, 255, 0.25);
```

**Theme 2 — Pyramedia (orange brand):**
```css
--accent: #F97316;
--accent-hover: #FB923C;
--accent-bg: rgba(249, 115, 22, 0.1);
--accent-border: rgba(249, 115, 22, 0.25);
```

Implementation:
- Toggle button with a 🎨 or palette icon
- Save preference in `localStorage` as `pyra-theme`
- Apply by adding `data-theme="pyramedia"` on `<body>`
- Use CSS: `[data-theme="pyramedia"] { --accent: #F97316; ... }`
- Smooth transition when switching (0.3s on background-color, color, border-color)
- Load saved theme on page load (before login screen shows)

### 2. Login Page Enhancement

- Replace the folder SVG icon with the **Pyramedia logo** — use this inline SVG or text logo:
  ```html
  <div class="login-logo">
      <span class="login-logo-icon">🔺</span>
      <span>Pyra<span style="color: var(--accent)">Workspace</span></span>
  </div>
  ```
- Add a **subtle gradient background**: `radial-gradient(ellipse at top, var(--bg-secondary) 0%, var(--bg-primary) 70%)`
- Add **fade-in animation** on the login card (opacity 0→1, translateY 20px→0, 0.5s ease)
- Add a **"Remember me" checkbox** (store username in localStorage, pre-fill on load — password NOT stored)
- Add subtle **floating particles or dots animation** in the background (CSS only, very subtle, no heavy JS)

### 3. Top Bar Redesign

- Make the logo text styled: "Pyra" in white + "Workspace" in accent color
- Add a **user avatar circle** next to the username (first letter of display_name, colored background)
- Add the **theme toggle button** here (small icon button)
- Add subtle **bottom border glow** on the top-bar using `box-shadow: 0 1px 0 var(--accent-border)`

### 4. File List — Grid View Toggle

Add a **view toggle** in the toolbar (List view ↔ Grid view):

**List View (current):** Keep as-is but improve:
- Better hover effect: `background` + subtle `box-shadow`
- Row separator lines slightly more visible
- Selected row: stronger accent glow

**Grid View (new):**
- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`
- Each item: card with icon/thumbnail centered, filename below, size below that
- Folders: large folder icon with folder name
- Images: show actual thumbnail (use the existing proxy URL: `api.php?action=proxy&path=FILEPATH`)
- Other files: large colored icon based on file type
- Hover: scale(1.03) + shadow
- Selected: accent border

Implementation:
- Add toggle buttons in toolbar (list icon + grid icon)
- Save preference in `localStorage` as `pyra-view`
- Add class `.view-grid` on `.file-panel` to switch
- Grid view hides the column headers
- File actions (rename, delete) appear on hover in grid view as small overlay buttons

### 5. Colored File Type Icons

Replace the current monochrome SVG icons with **colored versions**:
- 📁 Folders: `#FBBF24` (yellow/gold) — keep current
- 🖼️ Images: `#34D399` (green)
- 🎬 Video: `#F43F5E` (red/pink)
- 🎵 Audio: `#A78BFA` (purple)
- 📄 PDF: `#EF4444` (red)
- 📝 Markdown: `#38BDF8` (blue)
- 💻 Code: `#10B981` (emerald)
- 📦 Archive: `#F59E0B` (amber)
- 📋 Text/Docs: `#6366F1` (indigo)

Apply colors via CSS class on the `.file-icon` element based on file type.

### 6. Improved Animations & Micro-interactions

- **File items**: staggered fade-in when loading (each row delays 20ms)
- **Preview panel**: slide-in from right (translateX 100% → 0, 0.25s ease)
- **Modals**: scale(0.95) + opacity → scale(1) + opacity, 0.2s ease
- **Buttons**: subtle scale on hover (already exists, make it smoother)
- **Toast notifications**: slide-in from bottom-right with spring animation
- **Drop zone**: pulse animation on the border
- **Loading spinner**: replace with a smoother pulsing accent-colored dot animation

### 7. Empty State

When a folder is empty, show a friendly illustration:
```html
<div class="empty-state">
    <div class="empty-icon">📂</div>
    <h3>This folder is empty</h3>
    <p>Drop files here or click Upload to add files</p>
</div>
```
Style with large emoji, muted text, centered layout.

### 8. Breadcrumb Enhancement

- Each breadcrumb segment gets a subtle hover background
- Add small `›` separators (already may exist)  
- Current folder name in accent color and bold
- Add a small home icon 🏠 for root

### 9. Mobile/Responsive Improvements

- Toolbar buttons: **icons only** on screens < 768px (hide text labels)
- File list: hide the SIZE and MODIFIED columns on mobile
- Search: collapsible (show only 🔍 icon, expand on tap)
- Preview panel: full-screen overlay on mobile instead of side panel
- Grid view: 2 columns on mobile, 3 on tablet
- Touch-friendly: larger tap targets (min 44px)

### 10. Notification Badge

- Add a **pulsing red dot** on the notification bell when there are unread notifications
- Subtle scale animation when count changes

### 11. Drag & Drop Visual Improvement

- When dragging files over the drop zone, add a **glowing border** with accent color
- Pulsing background animation
- Icon animates (bounces slightly)

---

## File Structure Summary

You will modify these 3 files ONLY:
1. **`index.php`** — HTML changes (theme toggle button, grid view toggle, login logo, empty state markup)
2. **`style.css`** — All visual changes (themes, grid view, animations, colors, responsive)
3. **`app.js`** — Minimal JS changes (theme toggle logic, view toggle logic, localStorage, staggered animations)

**DO NOT create new files. DO NOT modify api.php.**

## How to Deploy

The files are hosted on shared hosting. After making changes, I'll upload the 3 files manually via FTP/cPanel.

## Testing Checklist

After all changes, verify:
- [ ] Login works (username/password)
- [ ] Theme switcher toggles between purple and orange
- [ ] Theme preference persists after page reload
- [ ] File list displays correctly in both List and Grid view
- [ ] View preference persists after page reload
- [ ] File upload works (single + drag & drop)
- [ ] File download works
- [ ] File preview works (images, PDF, markdown, code, video, audio, docx)
- [ ] File edit + save works
- [ ] File rename works
- [ ] File delete works (goes to trash)
- [ ] Folder creation works
- [ ] Search works
- [ ] Users management works (add, edit, delete, change password)
- [ ] Reviews/comments work
- [ ] Share links work
- [ ] Trash works (restore, permanent delete, empty)
- [ ] Activity log works
- [ ] Notifications work
- [ ] Breadcrumb navigation works
- [ ] Context menu (right-click) works
- [ ] Mobile responsive layout works
- [ ] RTL content displays correctly
- [ ] All modals open and close correctly
- [ ] Keyboard shortcuts still work
