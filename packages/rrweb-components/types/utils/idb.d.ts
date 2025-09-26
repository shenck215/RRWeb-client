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
    sentAt?: number;
};
/** 读取场景中“带 id 的 BatchRow” */
export type BatchRowWithId = BatchRow & {
    id: number;
};
/**
 * 写入一条批次（先入库再发送）
 * @returns 新记录的自增 id
 * @note 调用方通常不提供 `id`（由 IDB 生成）
 */
export declare function idbPutBatch(row: BatchRow): Promise<number>;
/**
 * 按 id 删除一条批次（发送成功后清理）
 */
export declare function idbDeleteBatch(id: number): Promise<void>;
/**
 * 统计批次数量
 * @param sessionId 可选；提供则统计该会话的数量，否则统计全库数量
 */
export declare function idbCountBatches(sessionId?: string): Promise<number>;
/**
 * 获取指定会话中最旧的若干条记录的 id（按 createdAt 升序）
 * @note 简化实现：先 getAll 再内存排序；批量不大时足够。
 */
export declare function idbGetOldestBySession(sessionId: string, limit: number): Promise<number[]>;
/**
 * 按会话做“上限裁剪”：若超过 cap，则从最旧开始删除多余的。
 * @returns { pruned } 实际删除条数
 */
export declare function idbPruneByCap(sessionId: string, cap: number): Promise<{
    pruned: number;
}>;
/**
 * 按“创建时间”清理过期批次（跨会话）
 * @param days 过期天数阈值（小于该阈值的记录会被删除）
 * @returns { pruned } 实际删除条数
 */
export declare function idbPruneByAge(days: number): Promise<{
    pruned: number;
}>;
/**
 * 将一条记录标记为“已发送”（写入 sentAt 时间戳）
 * - OBSERVE_MODE（开发观测模式）下，不立刻删除，而是延迟由心跳清理
 */
export declare function idbMarkSent(id: number): Promise<void>;
/**
 * 删除“已发送且 sentAt < ts”的记录（延迟删除）
 * @param ts 截止时间戳（ms）
 * @returns 实际删除的条数
 */
export declare function idbDeleteSentBefore(ts: number): Promise<number>;
/**
 * 查询“未发送”的批次（没有 sentAt 标记），并按 seq 升序返回。
 * - 队列发送主流程应 **仅使用本函数** 获取待发数据，避免 OBSERVE_MODE 下重复发送。
 */
export declare function idbGetUnsentBatches(sessionId: string): Promise<BatchRowWithId[]>;
