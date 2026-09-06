// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installWindowDragging } from './windowDragging';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.innerHTML = ''; });

it('drags nested header content once and preserves double-click maximize', () => {
  document.body.innerHTML = '<header data-tauri-drag-region><h1><span>Today</span></h1></header>';
  const drag = vi.fn().mockResolvedValue(undefined);
  const maximize = vi.fn().mockResolvedValue(undefined);
  dispose = installWindowDragging(drag, maximize);
  const nativeListener = vi.fn();
  document.addEventListener('mousedown', nativeListener);
  const title = document.querySelector('span')!;
  title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 }));
  expect(drag).toHaveBeenCalledTimes(1);
  expect(nativeListener).not.toHaveBeenCalled();
  title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 2 }));
  expect(maximize).toHaveBeenCalledTimes(1);
  document.removeEventListener('mousedown', nativeListener);
});

it('leaves controls, right clicks and page content alone, and supports top padding', () => {
  document.body.innerHTML = '<div class="app-frame"><header data-tauri-drag-region><button><span>Menu</span></button><input /></header><main>Tasks</main></div>';
  const drag = vi.fn().mockResolvedValue(undefined);
  dispose = installWindowDragging(drag, vi.fn().mockResolvedValue(undefined));
  for (const selector of ['span', 'input', 'main']) {
    document.querySelector(selector)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 50 }));
  }
  document.querySelector('header')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  expect(drag).not.toHaveBeenCalled();
  document.querySelector('.app-frame')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 8 }));
  expect(drag).toHaveBeenCalledTimes(1);
  dispose();
  document.querySelector('header')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  expect(drag).toHaveBeenCalledTimes(1);
});
