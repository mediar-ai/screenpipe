---
name: brand-style
description: "Screenpipe brand style guide. Reference this when designing UI components, writing copy, or making visual decisions."
allowed-tools: Read
---

# Screenpipe Brand Style Guide

## Philosophy

**"Black & White Geometric Minimalism"**

No color. Sharp corners. Clean typography.

---

## Core Values

| Value | Description |
|-------|-------------|
| **Privacy First** | 100% local, data never leaves your machine |
| **Open Source** | Inspect, modify, own |
| **Simplicity** | Clean, minimal interface |
| **Transparency** | "You own your data" |
| **Developer-Focused** | APIs, extensibility, power users |

---

## Typography

### Font Stack

| Purpose | Font | Fallbacks |
|---------|------|-----------|
| **Headings (sans)** | Space Grotesk | system-ui, sans-serif |
| **Body (serif)** | Crimson Text | Baskerville, Times New Roman, serif |
| **Code (mono)** | IBM Plex Mono | monospace |

### Usage Patterns

- **Headings**: Space Grotesk, lowercase preferred
- **Body text**: Crimson Text for readability
- **Code/technical**: IBM Plex Mono
- **Buttons**: UPPERCASE with tracking-wide
- **Labels**: lowercase, medium weight

---

## Colors

### Palette: Grayscale Only

**Light Mode:**
- Background: #FFFFFF (pure white)
- Foreground: #000000 (pure black)
- Muted: #666666 (40% gray)
- Border: #CCCCCC (80% gray)

**Dark Mode:**
- Background: #000000 (pure black)
- Foreground: #FFFFFF (pure white)
- Muted: #999999 (60% gray)
- Border: #333333 (20% gray)

### Text Hierarchy

| Level | Light Mode | Dark Mode |
|-------|------------|-----------|
| Primary | #000000 | #FFFFFF |
| Secondary | #666666 | #999999 |
| Tertiary | #999999 | #666666 |
| Disabled | #B3B3B3 | #4D4D4D |

### Rule: NO COLOR

- No accent colors (no blue, red, green, etc.)
- Status indicators use grayscale only
- Success/warning/error differentiated by icons, not color

---

## Geometry

### Border Radius

```
--radius: 0
```

**All corners are sharp.** No rounded corners anywhere.

### Borders

- Width: 1px solid
- Style: Sharp, binary (on/off)
- No gradients, no shadows

### Shadows

**None.** Flat design throughout. Use borders for separation.

---

## Components

### Buttons

```
- Font: UPPERCASE, tracking-wide
- Border: 1px solid
- Corners: Sharp (0px radius)
- Transition: 150ms
- Hover: Color inversion
```

### Cards

```
- Border: 1px solid
- Shadow: None
- Corners: Sharp
- Padding: 24px (p-6)
```

### Inputs

```
- Style: Command-line aesthetic
- Font: Monospace (IBM Plex Mono)
- Border: 1px solid
- Height: 40px (h-10)
- Focus: Border color change
```

### Dialogs

```
- Border: 1px solid
- Shadow: None
- Animation: 150ms fade
- Title: lowercase
```

---

## Motion & Animation

### Principles

- **Fast**: 150ms standard duration
- **Minimal**: Only essential state changes
- **Binary**: On/off, no elaborate easing

### Timing

| Animation | Duration |
|-----------|----------|
| Button hover | 150ms |
| Dialog open/close | 150ms |
| Accordion | 200ms |
| Page transitions | 150ms |

---

## Brand Voice

### Tone

- Lowercase, casual, direct
- Technical but accessible
- No marketing fluff
- Developer-oriented

### Examples

**Good:**
- "24/7 memory for your desktop"
- "you own your data"
- "100% local"

**Bad:**
- "REVOLUTIONARY AI-POWERED SOLUTION!"
- "Best-in-class enterprise memory platform"

---

## Taglines

- "24/7 memory for your desktop"
- "Rewind but open source. 100% local. You own your data."
- "Memory infrastructure for your computer"

---

## Design Checklist

When creating new UI components:

- [ ] Using Space Grotesk for headings
- [ ] Using Crimson Text for body (or IBM Plex Mono for technical)
- [ ] 1px solid border
- [ ] No box shadows
- [ ] 0px border radius (sharp corners)
- [ ] Black, white, or gray only
- [ ] 150ms transitions
- [ ] UPPERCASE for buttons, lowercase for titles
- [ ] Hover state: color inversion
- [ ] Focus ring: 1px solid with offset

---

## Key Files

| Purpose | Location |
|---------|----------|
| Design tokens | `screenpipe-app-tauri/app/globals.css` |
| Tailwind config | `screenpipe-app-tauri/tailwind.config.ts` |
| Color constants | `screenpipe-app-tauri/lib/constants/colors.ts` |
| UI components | `screenpipe-app-tauri/components/ui/*.tsx` |
| Website reference | `../screen-pipe-website/app/globals.css` |

---

## Website Typography Reference

From `screen-pipe-website/app/layout.tsx`:

```typescript
const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const fontSans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
});

const fontSerif = Crimson_Text({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});
```

Usage in CSS:
```css
body {
  font-family: var(--font-serif), "Crimson Text", serif;
}
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-sans), "Space Grotesk", sans-serif;
}
code, pre, kbd, .font-mono {
  font-family: var(--font-mono), "IBM Plex Mono", monospace;
}
```
