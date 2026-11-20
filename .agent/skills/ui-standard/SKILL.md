---
name: ui-standard
description: Personal Clean UI & Anti-AI-Slop design standard inspired by impeccable.style. Use when building, reviewing, or refining frontend interfaces, buttons, status indicators, cards, tables, forms, or handling [Auto-Standard] prompts from click-to-edit.
---

# UI Standard (Clean Product & Anti-AI-Slop)

Apply these baseline design rules whenever creating, editing, or reviewing frontend UI—especially when responding to `[Auto-Standard]` or `click-to-edit` prompts.

## 1. Clean Web Baseline (Anti-AI-Slop)
- **Clean colors & contrast**: Use a restrained, clean color palette with clear text/background contrast. Avoid loud/generic gradients, neon glows, or excessive drop shadows.
- **Consistent spacing & hierarchy**: Keep padding, margins, and alignment uniform across sibling elements. Maintain clear visual hierarchy through typography weight/size rather than extra boxes or borders.
- **Restraint**: Prefer crisp, minimal surfaces over decorative clutter.

## 2. Element-Specific Standards

### Status / Badges (`status`)
- **Status dot first**: Represent status with a small, clean colored dot (e.g., `6px–8px` circle) in front of concise text rather than heavy solid-fill pills or cluttered borders.
- Keep status text short, readable, and aligned with the dot (`inline-flex items-center gap-1.5`).

### Buttons (`button`)
- **No wrapping**: Button labels must never wrap onto multiple lines (`whitespace-nowrap`).
- **Moderate border-radius**: Do not make buttons overly round/capsule-shaped unless explicitly requested; use a clean, moderate radius (e.g., `6px–8px`).
- **Clean color & contrast**: Use clear, accessible foreground/background contrast and subtle hover states.

### Cards / Tables / Forms (`surface`)
- Maintain consistent internal padding, gap rhythm, and column/label alignment.
- Use light `1px` borders and subtle elevation instead of heavy shadows or nested card-in-card clutter.

---
*Note: Clean UI / anti-AI-slop principles are inspired by [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0).*
