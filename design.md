# Pigeon – Design Specification

## 1. Overview

Pigeon is a modern, minimalist social media platform inspired by Twitter. It focuses on real-time communication, short-form content, and clean visual presentation. The design emphasizes clarity, speed, and ease of interaction.

---

## 2. Design Principles

- **Minimalism**: Eliminate visual clutter. Prioritize content over decoration.
- **Clarity**: Strong hierarchy with readable typography and intuitive layout.
- **Consistency**: Uniform spacing, colors, and interaction patterns.
- **Responsiveness**: Seamless experience across mobile, tablet, and desktop.
- **Performance-first**: Fast loading and smooth interactions.

---

## 3. Color Palette

Primary palette:

- **Primary Blue**: #1DA1F2
- **Secondary Blue**: #0D8AEF
- **Background White**: #FFFFFF

Neutral palette:

- **Light Gray**: #F5F8FA
- **Medium Gray**: #AAB8C2
- **Dark Gray**: #657786
- **Text Black**: #14171A

Usage:

- Blue for actions, links, and highlights
- White for main background
- Gray tones for secondary text and borders

---

## 4. Typography

- **Primary Font**: Inter / System UI
- **Weights**:
  - Regular (400)
  - Medium (500)
  - Bold (700)

Hierarchy:

- Headings: Bold, larger sizes
- Body text: Regular, high readability
- Metadata: Smaller, gray text

---

## 5. Layout Structure

### Desktop Layout

- **Left Sidebar**: Navigation
- **Center Feed**: Main content
- **Right Sidebar**: Trends, suggestions

### Mobile Layout

- Bottom navigation bar
- Single-column feed
- Floating action button for posting

Grid:

- 8px spacing system

---

## 6. Core Features UI

### 6.1 Feed

- Vertical scrolling list
- Each post contains:
  - Avatar
  - Username + handle
  - Timestamp
  - Text content
  - Media (optional)
  - Action buttons (like, repost, comment, share)

### 6.2 Post Composer

- Fixed input area (top or modal)
- Character limit indicator
- Media upload button
- Submit button (blue primary)

### 6.3 Profile Page

- Cover image
- Profile avatar
- Bio and metadata
- Tabs: Posts, Replies, Media, Likes

### 6.4 Notifications

- List of interactions
- Categorized (mentions, likes, follows)

### 6.5 Search & Trends

- Search bar with instant results
- Trending topics list

---

## 7. Components

- Buttons: Rounded, subtle shadows, blue primary
- Cards: White background, soft border (#E1E8ED)
- Input fields: Rounded, light gray background
- Icons: Simple line icons

States:

- Hover: Slight darkening
- Active: Stronger blue
- Disabled: Faded gray

---

## 8. Interaction Design

- Smooth transitions (150–250ms)
- Micro-interactions for likes and reposts
- Infinite scrolling for feed
- Pull-to-refresh on mobile

---

## 9. Accessibility

- Contrast ratio compliant (WCAG AA)
- Keyboard navigable
- Screen reader support
- Scalable text

---

## 10. Branding

- Logo: Simple pigeon silhouette in blue
- Tone: Clean, calm, efficient
- No excessive animations or distractions

---

## 11. Future Enhancements

- Dark mode (navy/black palette)
- Threaded conversations
- Bookmark collections
- Advanced analytics for posts

---

## 12. Summary

Pigeon is designed as a clean, fast, and modern microblogging platform. The blue-and-white palette reinforces simplicity and trust, while the layout prioritizes readability and real-time engagement.
