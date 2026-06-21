# Chit Fund Frontend — Claude Code Rules

These rules are enforced on every task. Do not override them without an explicit user instruction.

---

## 1. UI Component Usage (MANDATORY)

### Buttons
- **Always** use `<Button>` from `src/components/ui/Button.jsx` for any clickable action.
- **Bare `<button>`** is only allowed for:
  - Icon-only toggles (eye/eyelid, close X, refresh, nav arrows, tab switchers, accordion toggles)
  - Style: `p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer`
- **Never** set fixed `h-X` or `w-X` on Button — size via padding only.
- Sizes: `size="sm"` for table row actions · `size="md"` (default) for form footers · `size="lg"` for hero CTAs.
- Variants: `primary` (navy) · `secondary` (outlined navy) · `danger` (red) · `success` (green) · `warning` (amber) · `muted` (gray) · `ghost`.

### Inputs / Selects / Textareas
- **Always** use `Input`, `Select`, `Textarea` from `src/components/ui/FormField.jsx`.
- Wrap in `<FormField label="…">` whenever there is a label.
- `w-full` within their container. The only exception: search boxes use `className="w-56"`.
- Never set fixed `h-X` on inputs.
- For date pickers use `DateInput` from the same file.

### Modals
- Use `Modal` from `src/components/ui/Modal.jsx` for all modals.
- Modal footer buttons: `<div className="flex gap-3 justify-end pt-2">`.
- Modal body content: `<div className="space-y-4">` or `<form className="space-y-4">`.

### Confirmation / Destructive dialogs
- Use `ConfirmDialog` or `DestructiveDialog` from `src/components/ui/ConfirmDialog.jsx`.
- Never write inline confirmation markup or use `window.confirm()`.

---

## 2. Spacing Scale (4 px base)

| Token | px |
|-------|----|
| gap-1 | 4  |
| gap-2 | 8  |
| gap-3 | 12 |
| gap-4 | 16 |
| gap-5 | 20 |
| gap-6 | 24 |

- Use `gap-X` on flex/grid parents, not stacked `mt-X` / `mb-X` between siblings.
- Form fields: `space-y-4` on the form container.
- Card sections: `space-y-3` or `space-y-4`.

---

## 3. Touch Targets

- Minimum effective touch target: **40 px**. Achieved via padding, not fixed size.
- `Button size="md"` (`px-4 py-2`) + 14 px font = ~36 px tall — acceptable.
- `Button size="lg"` (`px-6 py-3`) = ~44 px tall — use for primary CTAs.
- Icon-only buttons: `p-2` = 32 px content + border = ~36 px; acceptable for secondary actions.

---

## 4. Text Contrast & Clipping

- Body text: minimum `text-gray-700` on white backgrounds.
- Muted/hint text: `text-gray-400` or `text-gray-500`.
- Never let text sit edge-to-edge in a container — always `px-4` minimum on cards.
- Labels on inputs: `text-sm font-medium text-gray-700`.
- Error text: `text-xs text-red-500`.

---

## 5. Brand Colors

| Role | Hex |
|------|-----|
| Navy primary | `#1E3A5F` |
| Gold accent | `#D4A017` |
| Green success | `#16A34A` |
| Red danger | `#DC2626` |
| Amber warning | `#D97706` |

Use these via Tailwind inline styles or the existing variant system — do not invent new colors.

---

## 6. Hide/Show Amounts

- Use `useHiddenAmounts()` from `src/hooks/useHiddenAmounts.js` for any money amount that can be hidden.
- The hook syncs across all components on the page via a module-level listener registry (no StorageEvent side effects inside React state updaters).
- Toggle button style (icon-only, bare `<button>`):
  ```jsx
  <button
    type="button"
    onClick={toggleHidden}
    title={hidden ? 'Show amounts' : 'Hide amounts'}
    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
  >
    {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
  </button>
  ```
- Hidden placeholder: `'••••••'` (six bullets, `font-medium text-gray-400 tracking-widest`).

---

## 7. Role-Based UI

| Role | Restrictions |
|------|-------------|
| `ADMIN` | Full access |
| `MANAGER` | Can edit DRAFT chits only; cannot create/delete chits; no Disburse/Create Payout; no Delete Staff; can see all data |
| `WORKER` | Record Payment only; no financial data |
| `MEMBER` | Member portal only |

Check with `const { user } = useAuth(); const isManager = user?.role === 'MANAGER';` etc.

---

## 8. Tech Stack

- React 18 + Vite
- Tailwind CSS v4 (inline style fallback for brand colors)
- React Query (`@tanstack/react-query`) for all data fetching — never `useEffect` + `fetch`
- React Router v6 (`useNavigate`, `useParams`)
- Lucide React for icons
- Font families: `Merriweather, serif` for headings · `Inter, sans-serif` for body

---

## 9. API Conventions

- All API calls in `src/services/api.js` — never write `fetch`/`axios` calls inline in components.
- JWT token attached via axios interceptor — never manually set Authorization header.
- Error handling: `err.response?.data?.message ?? 'Fallback message'`.

---

## 10. File Organization

```
src/
  components/
    ui/          ← shared primitives (Button, Input, Modal, ConfirmDialog, Table…)
    layout/      ← Sidebar, AppLayout, MemberPortalLayout
    profile/     ← EditProfileModal, ProfileChangeHistory
    notifications/
  hooks/         ← useHiddenAmounts, etc.
  pages/
    admin/       ← TeamPage, StaffDetailPage, TreasuryPage, MyAccountPage
    chits/       ← ChitsPage, ChitDetailPage
    draws/       ← DrawsPage
    members/     ← MembersPage, MemberDetailPage
    payments/    ← PaymentsPage
    payouts/     ← PayoutsPage
    member/      ← MemberPortalPage
    worker/      ← WorkerHomePage, WorkerTasksPage
    manager/     ← ManagerHomePage
    reports/     ← ReportsPage
  services/
    api.js       ← all API calls
  context/
    AuthContext.jsx
```
