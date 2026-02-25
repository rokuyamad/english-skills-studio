function getInsertBeforeElement(container, itemSelector, y) {
  const candidates = [...container.querySelectorAll(itemSelector)].filter(
    (el) => !el.classList.contains('dragging')
  );

  let insertBefore = null;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (y < midpoint) {
      insertBefore = el;
      break;
    }
  }
  return insertBefore;
}

export function enableSidebarDnD({ container, itemSelector, getId, onReorder }) {
  if (!container) return () => {};

  const items = [...container.querySelectorAll(itemSelector)];
  let draggingEl = null;
  let moved = false;
  let suppressClickId = null;

  const onContainerDragOver = (event) => {
    if (!draggingEl) return;
    event.preventDefault();
    const insertBefore = getInsertBeforeElement(container, itemSelector, event.clientY);
    if (insertBefore) {
      if (insertBefore !== draggingEl && insertBefore.previousElementSibling !== draggingEl) {
        container.insertBefore(draggingEl, insertBefore);
        moved = true;
      }
    } else if (draggingEl !== container.lastElementChild) {
      container.appendChild(draggingEl);
      moved = true;
    }
  };

  container.addEventListener('dragover', onContainerDragOver);

  const removers = [];

  items.forEach((item) => {
    item.classList.add('sortable-item');
    item.draggable = true;

    const onDragStart = (event) => {
      draggingEl = item;
      moved = false;
      item.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', getId(item));
      }
    };

    const onDragEnd = async () => {
      item.classList.remove('dragging');

      if (!moved) {
        draggingEl = null;
        return;
      }

      const orderedIds = [...container.querySelectorAll(itemSelector)].map((el) => getId(el));
      suppressClickId = getId(item);
      setTimeout(() => {
        suppressClickId = null;
      }, 0);

      await onReorder(orderedIds);
      draggingEl = null;
      moved = false;
    };

    const onClickCapture = (event) => {
      if (suppressClickId && getId(item) === suppressClickId) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    item.addEventListener('dragstart', onDragStart);
    item.addEventListener('dragend', onDragEnd);
    item.addEventListener('click', onClickCapture, true);

    removers.push(() => {
      item.classList.remove('sortable-item', 'dragging');
      item.draggable = false;
      item.removeEventListener('dragstart', onDragStart);
      item.removeEventListener('dragend', onDragEnd);
      item.removeEventListener('click', onClickCapture, true);
    });
  });

  return () => {
    container.removeEventListener('dragover', onContainerDragOver);
    removers.forEach((fn) => fn());
  };
}
