import type { eventWithTime } from '@rrweb/types';

/**
 * 一条已持久化的事件批次。
 * - `id`：IndexedDB 自增主键（写入时无需提供；读取时一定存在）
 * - `sessionId`：会话标识
 * - `seq`：批次顺序号（递增）
 * - `createdAt`：写入时间戳（ms）
 * - `events`：rrweb 事件数组
 * - `sentAt`：可选，发送成功的标记时间（OBSERVE_MODE 下用于延迟删除）
 */
export type BatchRow = {
  id?: number;
  sessionId: string;
  seq: number;
  createdAt: number;
  events: eventWithTime[];
  sentAt?: number; // 发送成功时间（用于延迟删除）
};

/** 读取场景中“带 id 的 BatchRow” */
export type BatchRowWithId = BatchRow & { id: number };

/** IndexedDB 常量 */
const DB_NAME = 'rrweb-recorder' as const;
const DB_VERSION = 1 as const;
const STORE = 'batches' as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 打开/升级数据库。
 * - 若首次打开：创建对象仓库及索引。
 * - 失败时返回 rejected Promise（记日志即可）。
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        // 按会话查询
        store.createIndex('by_session', 'sessionId', { unique: false });
        // 会话内按 seq 去重（可用于幂等等）
        store.createIndex('by_session_seq', ['sessionId', 'seq'], { unique: true });
        // 按创建时间清理
        store.createIndex('by_created', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * 写入一条批次（先入库再发送）
 * @returns 新记录的自增 id
 * @note 调用方通常不提供 `id`（由 IDB 生成）
 */
export async function idbPutBatch(row: BatchRow): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(row);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 按 id 删除一条批次（发送成功后清理）
 */
export async function idbDeleteBatch(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * 统计批次数量
 * @param sessionId 可选；提供则统计该会话的数量，否则统计全库数量
 */
export async function idbCountBatches(sessionId?: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    if (!sessionId) {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      const idx = store.index('by_session');
      const req = idx.count(IDBKeyRange.only(sessionId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }
  });
}

/**
 * 获取指定会话中最旧的若干条记录的 id（按 createdAt 升序）
 * @note 简化实现：先 getAll 再内存排序；批量不大时足够。
 */
export async function idbGetOldestBySession(sessionId: string, limit: number): Promise<number[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as BatchRowWithId[])
        .filter(r => r.sessionId === sessionId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit)
        .map(r => r.id);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 按会话做“上限裁剪”：若超过 cap，则从最旧开始删除多余的。
 * @returns { pruned } 实际删除条数
 */
export async function idbPruneByCap(sessionId: string, cap: number): Promise<{ pruned: number }> {
  const count = await idbCountBatches(sessionId);
  if (count <= cap) return { pruned: 0 };
  const needDelete = count - cap;
  const ids = await idbGetOldestBySession(sessionId, needDelete);
  await Promise.all(ids.map(idbDeleteBatch));
  return { pruned: ids.length };
}

/**
 * 按“创建时间”清理过期批次（跨会话）
 * @param days 过期天数阈值（小于该阈值的记录会被删除）
 * @returns { pruned } 实际删除条数
 */
export async function idbPruneByAge(days: number): Promise<{ pruned: number }> {
  const db = await openDB();
  const cutoff = Date.now() - days * DAY_MS;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const idx = store.index('by_created');
    const req = idx.openCursor();
    let pruned = 0;

    req.onsuccess = async () => {
      const cursor: IDBCursorWithValue | null = req.result;
      if (!cursor) {
        resolve({ pruned });
        return;
      }
      const row = cursor.value as BatchRowWithId;
      if (row.createdAt < cutoff) {
        await new Promise<void>((res, rej) => {
          const del = cursor.delete();
          del.onsuccess = () => {
            pruned += 1;
            res();
          };
          del.onerror = () => rej(del.error);
        });
      }
      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * 将一条记录标记为“已发送”（写入 sentAt 时间戳）
 * - OBSERVE_MODE（开发观测模式）下，不立刻删除，而是延迟由心跳清理
 */
export async function idbMarkSent(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const row = getReq.result as BatchRowWithId | undefined;
      if (!row) {
        resolve();
        return;
      }
      row.sentAt = Date.now();
      const putReq = store.put(row);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * 删除“已发送且 sentAt < ts”的记录（延迟删除）
 * @param ts 截止时间戳（ms）
 * @returns 实际删除的条数
 */
export async function idbDeleteSentBefore(ts: number): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const rows = req.result as BatchRowWithId[];
      const toDel = rows.filter(r => r.sentAt && r.sentAt < ts).map(r => r.id);
      Promise.all(toDel.map(id => idbDeleteBatch(id)))
        .then(() => resolve(toDel.length))
        .catch(reject);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 查询“未发送”的批次（没有 sentAt 标记），并按 seq 升序返回。
 * - 队列发送主流程应 **仅使用本函数** 获取待发数据，避免 OBSERVE_MODE 下重复发送。
 */
export async function idbGetUnsentBatches(sessionId: string): Promise<BatchRowWithId[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('by_session');
    const req = idx.getAll(IDBKeyRange.only(sessionId));

    req.onsuccess = () => {
      const rows = (req.result as BatchRowWithId[])
        // 关键：只取“未发送”的
        .filter(r => !r.sentAt)
        // 会话内按 seq 顺序发送，便于服务端重放/合并
        .sort((a, b) => a.seq - b.seq);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}
