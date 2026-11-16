/**
 * TEMPORARY review aid (?debug=1): a small panel over the stage with a screen list, Back and Next.
 * With it on, the lesson never moves on by itself: every screen plays its dialogue and animation and
 * then waits for Next; Back replays the previous screen from its start; the list jumps anywhere.
 */
export function createDebugPanel({ hostEl, flow }) {
  const panel = document.createElement('div');
  panel.className = 'ws-debug';
  panel.innerHTML = `
    <button type="button" class="ws-debug__btn" data-act="back" aria-label="Back">◀ Back</button>
    <select class="ws-debug__select" aria-label="Jump to a screen"></select>
    <button type="button" class="ws-debug__btn ws-debug__btn--next" data-act="next" aria-label="Next">Next ▶</button>
    <span class="ws-debug__state"></span>`;
  const select = panel.querySelector('.ws-debug__select');
  const stateEl = panel.querySelector('.ws-debug__state');
  for (const screen of flow.screens) {
    const option = document.createElement('option');
    option.value = screen.id;
    option.textContent = `${screen.id} · ${screen.kind}`;
    select.appendChild(option);
  }
  select.addEventListener('change', () => flow.jumpTo(select.value));
  panel.querySelector('[data-act="back"]').addEventListener('click', () => flow.back());
  panel.querySelector('[data-act="next"]').addEventListener('click', () => flow.next());
  const render = () => {
    const current = flow.current;
    if (current && select.value !== current.id) select.value = current.id;
    stateEl.textContent = `${flow.index + 1}/${flow.screens.length} · ${flow.state}`;
    panel.classList.toggle('is-waiting', flow.state === 'WAITING_FOR_INPUT');
  };
  const off = flow.onChange(render);
  const timer = setInterval(render, 300);
  hostEl.appendChild(panel);
  render();
  return { element: panel, destroy() { clearInterval(timer); off(); panel.remove(); } };
}
