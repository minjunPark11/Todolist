// 집중 큐 — 사용자가 직접 만든 순서 (FOCUS_LAYOUT_DESIGN.md Phase 2).
//
// `Task.order`를 재사용하지 않는다(결정 1·2). 목록의 정렬은 그 목록의 것이고,
// "다음에 무엇에 집중할까"는 그것과 다른 질문이다. 같은 필드에 두 질문을 담으면
// 리스트를 정렬할 때마다 집중 순서가 따라 흔들린다.
//
// 저장 모델은 `taskId[]` 하나다(결정 3). `checkItems`의 sortKey 방식(분수 인덱싱)을
// 따르지 않는 것은, 그쪽이 푸는 문제 — 여러 클라이언트가 같은 목록에 동시에
// 끼워 넣는 것 — 가 여기에는 없기 때문이다. 큐는 한 사람이 자기 앞에 놓는 순서다.
//
// 이 파일은 순수 함수만 담는다. 상태도 저장도 모르므로 테스트가 값만 본다.

/** 큐에 담길 수 있는 것 — 이 모듈은 Task 전체를 알 필요가 없다. */
export interface QueueEligibleTask {
  id: string;
  status?: string;
  completedAt?: string;
  deletedAt?: string;
}

/**
 * 큐에 남아 있을 자격 (결정 9).
 *
 * 완료됐거나 휴지통에 있거나 아예 사라진 Task는 큐의 것이 아니다. 큐에서
 * 빠지는 것이 Task를 지우는 것은 아니지만(결정 8), 그 반대는 성립한다.
 */
export function isQueueable(task: QueueEligibleTask | undefined): boolean {
  if (!task) return false;
  if (task.deletedAt) return false;
  if (task.status === "completed") return false;
  if (task.completedAt) return false;
  return true;
}

/**
 * 저장된 순서에서 지금 보여줄 것만.
 *
 * 지우는 경로를 일일이 고치는 대신 읽을 때 거른다. `deleteTask` ·
 * `permanentlyDeleteTask` · `emptyTrash` · 동기화로 들어온 원격 삭제까지
 * 경로가 여럿이고, 그중 하나를 놓치면 큐가 유령을 그린다. 여기 한 곳이면
 * 아직 없는 경로까지 덮는다.
 */
export function visibleQueue<T extends QueueEligibleTask>(
  queue: readonly string[],
  tasks: readonly T[],
): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of queue) {
    if (seen.has(id)) continue;
    const task = byId.get(id);
    if (!isQueueable(task)) continue;
    seen.add(id);
    out.push(task as T);
  }
  return out;
}

/**
 * 저장할 순서에서 죽은 id를 턴다.
 *
 * 읽을 때 거르는 것만으로는 배열이 영영 자라기만 한다. 큐를 건드리는 모든
 * 쓰기가 이것을 통과하므로, 쌓이는 양은 "마지막으로 큐를 만진 뒤 완료되거나
 * 지워진 것"으로 묶인다.
 */
export function compactQueue(
  queue: readonly string[],
  tasks: readonly QueueEligibleTask[],
): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of queue) {
    if (seen.has(id)) continue;
    if (!isQueueable(byId.get(id))) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 큐 끝에 하나 (결정 4·7).
 *
 * 이미 있으면 아무 일도 하지 않는다 — 같은 Task가 두 자리를 차지하면 "다음"이
 * 어느 쪽인지 말할 수 없다. 순서를 바꾸고 싶으면 그것은 `moveInQueue`다.
 */
export function addToQueue(
  queue: readonly string[],
  taskId: string,
  tasks: readonly QueueEligibleTask[],
): string[] {
  if (!taskId) return [...queue];
  const compacted = compactQueue(queue, tasks);
  if (compacted.includes(taskId)) return compacted;
  if (!isQueueable(tasks.find((task) => task.id === taskId))) return compacted;
  return [...compacted, taskId];
}

/** 큐에서 하나 (결정 8 — Task는 그대로 남는다). */
export function removeFromQueue(
  queue: readonly string[],
  taskId: string,
  tasks: readonly QueueEligibleTask[],
): string[] {
  return compactQueue(queue, tasks).filter((id) => id !== taskId);
}

/**
 * 끌어다 놓은 자리로 (결정 10).
 *
 * `targetIndex`는 **옮기는 것을 뺀 뒤의** 배열에서의 자리다. 빼기 전 기준으로
 * 읽으면 아래로 내리는 드래그가 한 칸씩 모자라게 떨어진다.
 */
export function moveInQueue(
  queue: readonly string[],
  taskId: string,
  targetIndex: number,
  tasks: readonly QueueEligibleTask[],
): string[] {
  const compacted = compactQueue(queue, tasks);
  const from = compacted.indexOf(taskId);
  if (from === -1) return compacted;
  const without = compacted.filter((id) => id !== taskId);
  const at = Math.max(0, Math.min(Math.trunc(targetIndex), without.length));
  return [...without.slice(0, at), taskId, ...without.slice(at)];
}
