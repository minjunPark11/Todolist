# Motion System

## Purpose

FocusFlow motion is a product-language layer, not decoration. Its job is to make state changes feel connected:

- a task is created
- a task moves to another quadrant
- nearby cards make room
- a button expands into an input
- a side panel opens as part of the current workspace
- a draggable task can be dropped into a target area

The first milestone is narrow:

> In the Eisenhower matrix, task cards should feel like the same objects moving between stable positions, not like elements disappearing and reappearing.

## Current Code Fit

The app is a React/Vite application. It currently uses native HTML drag-and-drop in planning and calendar flows, and it already has an app-level reduced motion setting:

- `src/App.tsx` writes `document.documentElement.dataset.reduceMotion`.
- `src/components/EisenhowerPage.tsx` owns the matrix cards, quadrant drop zones, quick add popover, and add-task side panel.
- `src/components/calendar/CalendarRightTaskPanel.tsx` owns the draggable calendar task panel rows.
- `src/components/TaskDetail.tsx` owns the selected task detail panel.

Because drag-and-drop already works, the first implementation should not replace native drag with Framer Motion drag. Motion should layer visual continuity on top of the existing behavior.

## Dependency

Use `framer-motion`.

```bash
npm install framer-motion
```

Primary APIs:

- `motion`
- `AnimatePresence`
- `layout`
- `variants`
- `transition`
- `useReducedMotion`

Avoid `layoutId` in the first pass. Shared transitions between task cards and calendar blocks can come later.

## File Structure

```txt
src/
  motion/
    tokens.ts
    transitions.ts
    variants.ts
    reducedMotion.ts

  components/
    motion/
      MotionTaskRow.tsx
      MotionDropZone.tsx
      MotionPanelShell.tsx
      ExpandableAdd.tsx
```

## Tokens

`src/motion/tokens.ts`

```ts
export const motionDurations = {
  instant: 0.08,
  fast: 0.16,
  normal: 0.28,
  slow: 0.42,
};

export const motionScale = {
  tap: 0.985,
  hover: 1.01,
  drag: 1.025,
  panel: 0.985,
};

export const motionDistance = {
  popoverY: 4,
  cardY: 8,
  panelX: 32,
  modalY: 16,
};
```

Rule: component files should not invent one-off `duration`, `ease`, `scale`, or distance values unless there is a specific reason.

## Transitions

`src/motion/transitions.ts`

```ts
export const transitions = {
  fast: {
    duration: 0.16,
    ease: [0.2, 0, 0, 1],
  },
  soft: {
    duration: 0.28,
    ease: [0.2, 0, 0, 1],
  },
  panel: {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1],
  },
  spring: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.8,
  },
  layout: {
    type: "spring",
    stiffness: 500,
    damping: 38,
    mass: 0.7,
  },
  drag: {
    type: "spring",
    stiffness: 520,
    damping: 42,
    mass: 0.65,
  },
} as const;
```

Usage:

- `fast`: hover, tap, small UI feedback
- `soft`: card enter/exit, popover content
- `panel`: side panels and structural layout shifts
- `layout`: card reordering and quadrant moves
- `drag`: card lift/drop feedback

## Variants

`src/motion/variants.ts`

```ts
export const cardVariants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.96 },
};

export const draggingCardVariants = {
  idle: { scale: 1, y: 0 },
  dragging: { scale: 1.025, y: -2 },
};

export const dropZoneVariants = {
  idle: { scale: 1, opacity: 1 },
  over: { scale: 1.01, opacity: 1 },
};

export const panelVariants = {
  initial: { opacity: 0, x: 32, scale: 0.985 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 24, scale: 0.985 },
};

export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.06,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
};
```

## Reduced Motion

Reduced motion should respect both OS preference and the app setting.

Implementation direction:

- Use `useReducedMotion()` for OS preference.
- Read `document.documentElement.dataset.reduceMotion === "true"` for app preference, or pass the app setting through context later if needed.
- When reduced motion is active:
  - remove `y` and `scale` changes
  - use very short opacity changes only where helpful
  - use near-instant layout transitions
  - avoid panel slide distance

The first implementation can centralize this with a small helper:

```ts
export function getMotionEnabled(appReducedMotion: boolean, osReducedMotion: boolean | null) {
  return !appReducedMotion && !osReducedMotion;
}
```

## Components

### MotionTaskRow

Purpose: shared motion wrapper for task cards/rows.

First users:

- Eisenhower matrix rows
- Calendar right task panel rows
- Today/Focus task lists later

Contract:

```ts
type MotionTaskRowProps = {
  taskId: string;
  isDragging?: boolean;
  className?: string;
  draggable?: boolean;
  title?: string;
  children: React.ReactNode;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
};
```

Rules:

- Always use `key={task.id}` at the list level.
- Use `layout`.
- Use one hover/tap layer per card, not nested hover springs.
- Keep native drag-and-drop handlers intact.

### MotionDropZone

Purpose: shared wrapper for subtle drop target feedback.

First users:

- Eisenhower quadrants
- Calendar time slots later

Contract:

```ts
type MotionDropZoneProps = {
  isOver: boolean;
  className?: string;
  children: React.ReactNode;
};
```

Rules:

- Highlight should be subtle.
- Use CSS for color/border changes.
- Use Framer Motion only for small transform/opacity changes.

### MotionPanelShell

Purpose: shared side-panel motion.

First users:

- Eisenhower add-task side panel
- Main `TaskDetail` selected-task panel later

Rules:

- Render inside `AnimatePresence`.
- Stagger internal sections only where it does not slow editing.
- If possible, the parent layout should also respond to panel open/close, not only the panel itself.

### ExpandableAdd

Purpose: button-to-input transformation.

First users:

- Eisenhower quick add
- Calendar right task panel add UI later

States:

- `collapsed`
- `expanded`
- `submitting`

UX:

- click opens
- Enter submits
- Escape closes
- empty blur closes
- non-empty blur preserves the typed value unless the caller chooses autosave

This should be implemented after card motion and drag feedback are stable.

## Implementation Plan

### Phase 1: Foundation

- Install `framer-motion`.
- Add `src/motion/` tokens, transitions, variants, reduced-motion helper.
- Add `src/components/motion/` wrappers.
- Add minimal CSS classes:
  - `.motion-task-row`
  - `.motion-task-row.is-dragging`
  - `.motion-drop-zone`
  - `.motion-drop-zone.is-over`
  - `.motion-panel-shell`

Done when shared motion values are importable and no feature behavior has changed.

### Phase 2: Eisenhower Card Continuity

- Wrap Eisenhower task rows with `MotionTaskRow`.
- Wrap task lists with `AnimatePresence initial={false}`.
- Confirm all list keys use `task.id`.
- Use `layout` for card position changes.

Done when adding, completing, moving, and reclassifying tasks feels continuous.

### Phase 3: Drag Feedback

- Add `draggingTaskId` state to `EisenhowerPage`.
- Set it on native `onDragStart`.
- Clear it on `onDragEnd` and drop.
- Apply `isDragging` to `MotionTaskRow`.
- Wrap quadrant cells with `MotionDropZone` or use motion directly in `QuadrantCard`.

Done when a dragged card lifts subtly and a valid quadrant softly highlights.

### Phase 4: Calendar Right Task Panel

- Apply `MotionTaskRow` to `CalendarRightTaskPanel` rows.
- Reuse the same drag visual language.
- Keep the existing calendar drag contract unchanged.

Done when the calendar task panel feels like the Eisenhower matrix, without changing scheduling behavior.

### Phase 5: Panels

- Apply `MotionPanelShell` to the Eisenhower add-task panel.
- Later apply it to global task detail if the parent layout can respond cleanly.
- Keep stagger short; editing panels should not feel delayed.

Done when the panel opens smoothly without feeling like an unrelated overlay.

### Phase 6: Expandable Add

- Replace the Eisenhower quick-add popover with `ExpandableAdd`.
- Preserve existing create-task behavior and toast behavior.
- Reuse in calendar task creation if the local UX fits.

Done when `+ Add task` expands into an input instead of swapping abruptly.

## Deferred

- Framer Motion `drag` replacement.
- `layoutId` shared transitions between matrix cards and calendar blocks.
- Global page transition animation.
- Applying motion to every card/list/popup in the app.
- Complex spring tuning per surface.

## Guardrails

Do not:

- convert every `div` to `motion.div`
- add per-component custom duration/easing values
- use array indexes as task keys
- remove native drag-and-drop behavior in the first pass
- use strong color flashes for drop zones
- add heavy shadow animation to large lists
- ignore reduced motion

## QA Checklist

Card motion:

- [ ] New cards enter with opacity/y/scale that feels natural.
- [ ] Removed cards do not cause a jarring layout jump.
- [ ] Moving a card between quadrants feels like the same object moved.
- [ ] No task list uses array index as a key.

Drag motion:

- [ ] Dragged card lifts subtly.
- [ ] Drop target highlight is visible but calm.
- [ ] Drop clears drag state.
- [ ] Native drag-and-drop behavior still works.

Panel motion:

- [ ] Panel enter/exit is smooth.
- [ ] Focus moves correctly to the first input where applicable.
- [ ] Escape/close behavior still works.
- [ ] Reduced motion avoids slide/scale.

Performance/accessibility:

- [ ] Reduced motion setting is respected.
- [ ] `will-change` is used only on moving primitives.
- [ ] Long lists remain responsive.
- [ ] Keyboard interaction is unchanged.

