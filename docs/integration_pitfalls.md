# UI Integration Pitfalls & Checklist

This document records issues encountered when integrating the `readio-ui-standard-demo` prototype into the main project and provides a checklist for future iterations.

---

## Issue Summary

### Issue 1: Virtuoso Virtual List Height Calculation Failure

**Symptom**: After uploading a file, the player page is completely blank, and captions do not appear.

**Root Cause**: 
`react-virtuoso` requires an explicit container height to render the virtual list correctly. During integration, I wrapped the `Virtuoso` component in a `div` with padding:

```tsx
// ❌ Incorrect
<div className="max-w-3xl mx-auto px-6 py-20">
    <Virtuoso style={{ height: '100%' }} ... />
</div>
```

This parent `div` had no explicit height, causing `Virtuoso`'s `height: 100%` to evaluate to 0, resulting in no items being rendered.

**Why the Demo Worked**: 
The demo did not wrap Virtuoso in an extra div; styling was applied directly within `itemContent`.

**Resolution**:
```tsx
// ✅ Correct
<Virtuoso
    style={{ height: '100%' }}
    itemContent={(index, subtitle) => (
        <div className="max-w-3xl mx-auto px-6">
            <SubtitleLine ... />
        </div>
    )}
    components={{
        Header: () => <div className="h-20" />,
        Footer: () => <div className="h-[50vh]" />,
    }}
/>
```

---

### Issue 2: Incomplete useEffect Dependency Array Causing Event Listeners Not to Bind

**Symptom**: When playing audio, the progress bar and time display remain stuck at `0:00`, and caption highlighting does not follow the playhead.

**Root Cause**:
In `__root.tsx`, the `useEffect` dependency array for the audio event listeners did not include `audioUrl`:

```tsx
// ❌ Incorrect
useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;  // On first mount, audio is null, so it returns early
    
    audio.addEventListener('timeupdate', onTimeUpdate);
    // ...
}, [setProgress, setDuration]);  // Missing audioUrl
```

On the first component mount, `audioUrl` is empty, the `<audio>` element hasn't been created yet, and `audioRef.current` is `null`.
Since `setProgress` and `setDuration` are stable function references, the effect does not re-run.
When the user uploads a file and `audioUrl` changes, the `<audio>` element is created, but **the listener is never added**.

**Why the Demo Worked**:
The demo used a Context Provider pattern where the audio element was created upon Provider initialization, avoiding "late creation" issues.

**Resolution**:
```tsx
// ✅ Correct
useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.addEventListener('timeupdate', onTimeUpdate);
    // ...
}, [audioUrl, setProgress, setDuration]);  // Added audioUrl
```

---

## Iteration Checklist

When performing UI integration or refactoring, check the following:

### Virtual List (react-virtuoso)

- [ ] Virtuoso's **immediate parent container** must have an explicit height (`height: 100%` or fixed pixels).
- [ ] Do not add containers with vertical padding/margin outside Virtuoso.
- [ ] Use `components.Header` and `components.Footer` to add top/bottom spacing to the list.
- [ ] During testing, check if the `data-index` attribute exists in the DOM.

### useEffect Dependency Arrays

- [ ] When an effect depends on an element referenced by a ref, consider if that element might only be created in a later render.
- [ ] If a ref points to a conditionally rendered element (e.g., `{condition && <element ref={ref} />}`), the condition variable must be in the dependency array.
- [ ] Use Biome's `useExhaustiveDependencies` rule, but understand its warnings.

### Audio Player

- [ ] Event listeners for the audio element must be bound only after the element actually exists.
- [ ] Test playback and verify: time display updates, progress bar moves, and captions follow.
- [ ] Use the browser console to verify if `document.querySelector('audio').currentTime` is changing.

### State Synchronization

- [ ] Ensure Store state changes correctly trigger UI updates.
- [ ] When a component depends on multiple Store slices, verify all slices are correctly subscribed.
- [ ] Test complete user flows, not just individual components.

---

### Interaction & Focus Management

- [ ] **Portal Event Bubbling**: Have `mousedown` and `onClick` events been explicitly stopped in Dropdown / Popover Content? (Prevents interference with parent Card events).
- [ ] **Non-Modal Mode**: Do menus involving inline editing (e.g., Rename) have `modal={false}` set? (Prevents focus theft).
- [ ] **Declarative Focusing**: Is `autoFocus` prioritized over `setTimeout` for focusing?
- [ ] **Event Bridging**: In complex components (with MouseDown/Up/Click), are Ref Flags used to prevent "double-firing" or logic races?

---

## Debugging Tips

### Check if Virtuoso is Rendering

```javascript
// Execute in the browser console
document.querySelectorAll('[data-index]').length
// Returns 0 if the virtual list is not rendering any items
```

### Check if Audio Events are Bound

```javascript
// Check audio element status
const audio = document.querySelector('audio');
console.log({
    currentTime: audio?.currentTime,
    paused: audio?.paused,
    duration: audio?.duration
});

// Manually trigger timeupdate for testing
audio?.dispatchEvent(new Event('timeupdate'));
```

### Check Store State

Since the Zustand store is not exposed on `window`, add temporary logs in components:
```tsx
const progress = usePlayerStore(state => state.progress);
console.log('Current progress:', progress);
```

---

## Architecture Difference Summary

| Aspect | Demo Architecture | Main Project Architecture | Potential Issue |
|------|-----------|------------|----------|
| Audio Element | Created in Context Provider | Condition-rendered in `__root.tsx` | Needs to handle delayed element creation |
| Routing | Simple state switching | TanStack Router | State persistence during route changes |
| Caption Parsing | Built-in mock data | Dexie + File upload | Async loading timing |
| Virtual List | No extra wrapper | Style container might be added | Height calculation failure |

---

*Document Created: 2024-12-24*
*Last Updated: 2024-12-30*
