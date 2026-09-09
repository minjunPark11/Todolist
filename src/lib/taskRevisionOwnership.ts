import { TaskRevisionBlocked } from "../domain/sync/taskRevisionSession";

/** One owner per browser storage origin/account. Held until unmount/sign-out. */
export async function acquireTaskRevisionOwnership(userId: string, locks: LockManager | undefined = navigator.locks): Promise<() => void> {
  if (!locks) throw new TaskRevisionBlocked("이 브라우저는 안전한 작업 저장을 지원하지 않습니다. 브라우저를 업데이트해 주세요. / Web Locks required for task sync.");
  return new Promise((resolve, reject) => {
    void locks.request(`focusflow:task-revisions:${userId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        reject(new TaskRevisionBlocked("다른 탭에서 작업을 동기화하고 있습니다. 해당 탭을 닫은 뒤 다시 동기화해 주세요. / Another tab owns task sync."));
        return;
      }
      let release!: () => void;
      const released = new Promise<void>((done) => { release = done; });
      resolve(release);
      await released;
    }).catch(reject);
  });
}
