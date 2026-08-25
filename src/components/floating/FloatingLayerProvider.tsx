// §19.70's FloatingLayerManager, and the only place in the app that listens
// for Escape or an outside pointer on behalf of a floating surface.
//
// The rules it applies are all in `domain/floating` and all pure. What is left
// here is the part that genuinely needs a browser: the portal root, the two
// document listeners, and a registry mapping an open layer to the DOM nodes
// that answer "was the pointer inside this?".
//
// §19.71 is the boundary this file stays behind. It routes dismissals and
// hands out stacking numbers; it has never heard of a Priority, a Tag, or a
// Task. `ownerTaskId` is an opaque string to it — the app supplies one, and
// the only thing this does with it is compare it for equality.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  dismissedByPointer,
  orphanedByOwner,
  pushLayer,
  removeLayer,
  topDismissable,
  zIndexOf,
  type DismissReason,
  type Layer,
} from "../../domain/floating";

/**
 * What a layer gives the manager when it opens.
 *
 * The elements arrive as getters rather than as values because both are refs
 * that fill in after the first render, and a surface that registered `null`
 * once would be treated as "the pointer was never inside it" for as long as it
 * stayed open — every click on its own contents closing it.
 */
export interface LayerRegistration {
  surface: () => HTMLElement | null;
  trigger: () => HTMLElement | null;
  dismiss: (reason: DismissReason) => void;
}

interface FloatingLayerContextValue {
  openLayer: (layer: Layer, registration: LayerRegistration) => void;
  /**
   * Returns whether there was an open layer to close.
   *
   * The caller needs to know, because a surface can be asked to close in the
   * gap between rendering and registering, and in that window nobody would
   * otherwise tell it.
   */
  closeLayer: (id: string, reason: DismissReason) => boolean;
  /** Unregister without dismissing — for a surface unmounting on its own. */
  releaseLayer: (id: string) => void;
  /** §19.74's owner. Set through `useFloatingLayerOwner`, not directly. */
  setOwnerTaskId: (id: string | null) => void;
  isOpen: (id: string) => boolean;
  zIndex: (id: string) => number;
  portalRoot: HTMLElement | null;
}

const FloatingLayerContext = createContext<FloatingLayerContextValue | null>(null);

export function useFloatingLayers(): FloatingLayerContextValue {
  const context = useContext(FloatingLayerContext);
  if (!context) {
    throw new Error("A floating surface was rendered outside <FloatingLayerProvider>.");
  }
  return context;
}

const PORTAL_ID = "floating-layer-root";

/**
 * §19.6's root, created on FIRST RENDER rather than in an effect.
 *
 * The effect version had a real failure mode. A surface mounted in the same
 * commit as the provider — a context menu rendered from the initial state, or
 * anything in a test — saw `portalRoot === null`, rendered nothing, and so
 * never gave the positioning hook a surface to measure. The portal arrived a
 * tick later and the surface appeared, but nothing re-ran the measurement, so
 * it stayed at `visibility: hidden` permanently: present in the DOM, absent
 * from the screen and from the accessibility tree.
 *
 * Idempotent by id, so React calling this twice under StrictMode finds the
 * node the first call made instead of appending a second one.
 *
 * One root, shared. A node per surface would make document order — and with it
 * the tie-break between equal z-indexes — depend on mount order.
 */
function ensurePortalRoot(): HTMLElement {
  const existing = document.getElementById(PORTAL_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = PORTAL_ID;
  document.body.appendChild(root);
  return root;
}

/**
 * Tell the layer system which Task's Detail is open (§19.21, §19.74).
 *
 * A hook rather than a prop on the provider, because the provider is mounted
 * at the root — above the router, so that a popover anywhere in the app has
 * one — and the selected Task is known far below it. This is the only thing
 * the layer system is ever told about Tasks, and it is told it as an opaque
 * string it does no more than compare (§19.71).
 */
export function useFloatingLayerOwner(taskId: string | null): void {
  // Tolerates a missing provider, where `useFloatingLayers` refuses to. The
  // two are asking different things: a surface CANNOT work without a manager,
  // while this only tells one that exists whose Task is open. A screen
  // rendered on its own — in a test, or in isolation — has no layers for the
  // answer to be about, and should not have to mount the app's root to say so.
  // A genuinely missing provider is still caught loudly, by the first popover
  // that tries to open.
  const context = useContext(FloatingLayerContext);
  const setOwnerTaskId = context?.setOwnerTaskId;
  useEffect(() => {
    if (!setOwnerTaskId) return;
    setOwnerTaskId(taskId);
    // Cleared on unmount: the screen that owned the selection is gone, so no
    // surface still open can belong to anything.
    return () => setOwnerTaskId(null);
  }, [taskId, setOwnerTaskId]);
}

export function FloatingLayerProvider({ children }: { children: ReactNode }) {
  // The stack lives in a ref AND in state. The ref is the source of truth, so
  // that opening a layer can synchronously work out which layers that evicted
  // and notify them; doing that inside a setState updater would run the
  // notifications twice under StrictMode. The state exists only so a change in
  // stacking order re-renders.
  const stackRef = useRef<Layer[]>([]);
  const [stack, setStack] = useState<Layer[]>([]);
  const registry = useRef(new Map<string, LayerRegistration>());
  const [portalRoot] = useState(ensurePortalRoot);
  const [ownerTaskId, setOwnerTaskId] = useState<string | null>(null);

  // Created on first render (see `ensurePortalRoot`); attached and detached
  // here.
  //
  // The re-attach is not defensive padding. StrictMode mounts, tears down and
  // mounts again, so the cleanup below runs once before the app is really
  // running — and without this line it left the root DETACHED while the state
  // still pointed at it. Every surface then portalled into a node that was not
  // in the document: present, laid out nowhere, invisible. It cost an
  // afternoon in the browser, and no unit test could see it because Testing
  // Library does not render through StrictMode.
  useEffect(() => {
    if (!portalRoot.isConnected) document.body.appendChild(portalRoot);
    return () => portalRoot.remove();
  }, [portalRoot]);

  const commit = useCallback((next: Layer[]) => {
    stackRef.current = next;
    setStack(next);
  }, []);

  const closeLayer = useCallback(
    (id: string, reason: DismissReason): boolean => {
      const current = stackRef.current;
      if (!current.some((layer) => layer.id === id)) return false;
      const next = removeLayer(current, id);
      commit(next);
      // Children first: `removeLayer` takes the subtree, and a child that
      // learns it is closing after its parent has already re-rendered would be
      // telling a feature about a surface that is no longer there.
      const closed = current.filter((layer) => !next.some((kept) => kept.id === layer.id));
      for (const layer of [...closed].reverse()) {
        registry.current.get(layer.id)?.dismiss(reason);
      }
      return true;
    },
    [commit],
  );

  const openLayer = useCallback(
    (layer: Layer, registration: LayerRegistration) => {
      registry.current.set(layer.id, registration);
      const previous = stackRef.current;
      const next = pushLayer(previous, layer);
      commit(next);
      // §19.23's eviction, told to the surfaces it evicted. Without this the
      // manager and the component would disagree about what is open: the
      // popover would keep rendering itself while no longer being in the stack
      // that decides Escape and outside clicks.
      for (const gone of previous) {
        if (gone.id === layer.id) continue;
        if (next.some((kept) => kept.id === gone.id)) continue;
        registry.current.get(gone.id)?.dismiss("superseded");
      }
    },
    [commit],
  );

  const releaseLayer = useCallback(
    (id: string) => {
      registry.current.delete(id);
      if (stackRef.current.some((layer) => layer.id === id)) {
        commit(removeLayer(stackRef.current, id));
      }
    },
    [commit],
  );

  // §19.27 / §19.28. One listener, in the capture phase, so a feature that
  // stops propagation on its own row cannot accidentally keep a popover open.
  //
  // `pointerdown` rather than `click`: a click only lands after the button is
  // released, so a press that starts outside and drags into the surface would
  // never dismiss it, and the surface would still be there under a pointer
  // that has already moved on.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const stack = stackRef.current;
      if (stack.length === 0) return;
      const target = event.target as Node | null;
      if (!target) return;
      const hit = stack
        .filter((layer) => {
          const registration = registry.current.get(layer.id);
          if (!registration) return false;
          return (
            registration.surface()?.contains(target) === true ||
            registration.trigger()?.contains(target) === true
          );
        })
        .map((layer) => layer.id);
      for (const id of dismissedByPointer(stack, hit)) closeLayer(id, "outside-pointer");
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [closeLayer]);

  // §19.92, §19.93: one Escape, one layer, decided centrally.
  //
  // Bubble, deliberately, and this is the one place the layer system yields
  // priority. §19.25's rule is that Escape peels ONE layer, innermost first,
  // and a layer is not always a popover: the Schedule editor's subpanels go
  // back to the calendar on Escape, and a field with an uncommitted draft
  // abandons the draft. Those handlers sit inside the surface. On the capture
  // phase this listener would reach the key before any of them and close the
  // whole popover instead, which is exactly the collapse §19.99 forbids.
  //
  // So anything nested gets first refusal by calling `preventDefault`, and
  // what is left arrives here. `preventDefault` is then how the Drawer beneath
  // knows to stay open — it already checks `defaultPrevented` for this. With
  // no layer open nothing is prevented and Escape falls through, which is what
  // keeps the Drawer closable while no popover is up.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const top = topDismissable(stackRef.current);
      if (!top) return;
      event.preventDefault();
      closeLayer(top.id, "escape");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeLayer]);

  // §19.21. Not in the same effect as anything else: this fires on selection
  // changes only, and a layer with no owner is deliberately left alone.
  useEffect(() => {
    for (const id of orphanedByOwner(stackRef.current, ownerTaskId)) {
      closeLayer(id, "owner-unmounted");
    }
  }, [ownerTaskId, closeLayer]);

  // `isOpen` and `zIndex` read the state rather than the ref: they are answers
  // a surface RENDERS from, so they have to change identity when the stack
  // does. The ref is for the event handlers above, which need what is true
  // now rather than what was true at the last paint.
  const value = useMemo<FloatingLayerContextValue>(
    () => ({
      openLayer,
      closeLayer,
      releaseLayer,
      setOwnerTaskId,
      isOpen: (id) => stack.some((layer) => layer.id === id),
      zIndex: (id) => zIndexOf(stack, id),
      portalRoot,
    }),
    [openLayer, closeLayer, releaseLayer, portalRoot, stack],
  );

  return <FloatingLayerContext.Provider value={value}>{children}</FloatingLayerContext.Provider>;
}
