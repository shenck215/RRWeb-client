/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable no-await-in-loop,no-void,no-console */
import React, { useEffect, useRef, useState } from "react";

import { record } from "rrweb";
import type { eventWithTime, listenerHandler } from "@rrweb/types";

import { gzipJson } from "../utils/gzipJson";
import {
	idbDeleteBatch,
	idbDeleteSentBefore,
	idbGetUnsentBatches,
	idbMarkSent,
	idbPruneByAge,
	idbPruneByCap,
	idbPutBatch,
} from "../utils/idb";
import { Main } from "./index.styled";

console.log(
	"%c隐私提示：已默认 maskAllInputs（表单打码），你也可以对特定 DOM 使用 .rr-block / .rr-mask 类控制录制粒度。",
	"color: #e66a34; "
);

/**
 * RRWeb 录制组件（带 IndexedDB 持久化、队列串行上传、心跳自检、延迟删除观察模式、keepalive 兜底）
 *
 * 设计要点：
 * - 事件先入内存缓冲，按“条数阈值 / 体积阈值 / 定时器”触发 flush；
 * - flush 时先落盘（IndexedDB），然后由串行队列发送（成功：删除/打标）；
 * - 页面隐藏/关闭时，使用 keepalive 兜底尝试发送“小包”，大包仅落盘，待下次心跳续传；
 * - 观测模式（OBSERVE_MODE=true）：发送成功不立删，而是打 sentAt 标记，延迟一段时间由心跳清理；
 * - 并发控制：全局 inFlight 锁 + uploadingRef 只允许一个队列循环在跑，避免并发请求竞争。
 */

/** =========================
 * 可配置参数
 * ========================= */
const apiBase = "http://localhost:4000";

const BATCH_INTERVAL = 3000; // 定时 flush 周期（ms）
const BATCH_SIZE = 50; // 条数阈值
const MAX_BATCH_BYTES = 200 * 1024; // 体积阈值（未压缩估算，约 200KB）
const USE_GZIP = true; // 是否尝试压缩

// 观测模式：发送后不立删，标记 sentAt；由心跳在 DELAY_DELETE_MS 后清理，便于在 DevTools 查看 IDB 数据
const OBSERVE_MODE = false;
const DELAY_DELETE_MS = 60_000; // 延迟删除时间（ms）

const HEARTBEAT_INTERVAL = 10_000; // 心跳自检周期（ms）
const MAX_PENDING_BATCHES = 500; // 每个 session 本地最多保留的批次数
const MAX_AGE_DAYS = 7; // 超过 N 天的批次清理（按 createdAt）

// keepalive 的单次请求体最大建议阈值（浏览器一般 ~64KB 限制，这里取 60KB 更保守）
const KEEPALIVE_MAX_BYTES = 60 * 1024;

/** =========================
 * 类型与小工具
 * ========================= */

/** setInterval/clearInterval 在 DOM 环境返回 number，更稳妥 */
type Timer = number | null;

/** 队列发送的可选参数 */
interface KeepaliveOptions {
	keepalive?: boolean;
}

/** IndexedDB 中的一条批次记录的形状（按 idb.ts 的最小约定推导） */
type StoredBatch = {
	id: number;
	sessionId: string;
	seq: number;
	createdAt: number;
	events: eventWithTime[];
	sentAt?: number;
};

// 估算对象序列化后的字节大小（未压缩，粗略但足够）
const roughSizeOf = (obj: unknown): number =>
	new Blob([JSON.stringify(obj)]).size;

const RecordComponent: React.FC = () => {
	const [sessionId, setSessionId] = useState<string>("");
	const [isRecording, setIsRecording] = useState<boolean>(false);

	/** rrweb 停止函数（record 的返回值） */
	const stopFn = useRef<listenerHandler | null>(null);

	/** 内存缓冲区：累计 rrweb 事件，触发条件满足后出队 */
	const buffer = useRef<eventWithTime[]>([]);

	/** 周期 flush 计时器 / 心跳计时器 */
	const flushTimer = useRef<Timer>(null);
	const heartbeatTimer = useRef<Timer>(null);

	/** 并发与顺序控制 */
	const inFlight = useRef<boolean>(false); // 防并发发送：sendPayload 层的轻量锁
	const uploadingRef = useRef<boolean>(false); // 上传循环是否在跑（防止重复进入）
	const resumingRef = useRef<boolean>(false); // 是否在做续传
	const seqRef = useRef<number>(1); // 批次序号（递增）
	const cleanTickRef = useRef<number>(0); // 心跳内的清理节流（每 6 次做一次老化清理）

	/**
	 * 发送 HTTP 请求（串行保障）
	 * @param url 接口地址
	 * @param body JSON 序列化的请求体（对象）
	 * @param keepalive 是否开启 keepalive（页面关闭/隐藏时兜底）
	 */
	const sendPayload = async (
		url: string,
		body: unknown,
		keepalive = false
	): Promise<void> => {
		// 简单自旋锁，确保串行发送，防止并发请求打满后端
		while (inFlight.current) {
			await new Promise((r) => setTimeout(r, 8));
		}
		inFlight.current = true;
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				keepalive,
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		} finally {
			inFlight.current = false;
		}
	};

	/**
	 * 实际发送一批事件：优先 gzip（CompressionStream），失败回退为明文 JSON
	 * @param curSessionId 会话 ID
	 * @param events 事件批次
	 * @param opts keepalive 选项
	 */
	const postBatch = async (
		curSessionId: string,
		events: eventWithTime[],
		opts?: KeepaliveOptions
	): Promise<void> => {
		const payloadBase = { sessionId: curSessionId };
		console.log(events);
		const json = JSON.stringify(events);

		if (USE_GZIP && "CompressionStream" in window) {
			try {
				const b64 = await gzipJson(json);
				await sendPayload(
					`${apiBase}/events`,
					{ ...payloadBase, compressed: true, payload: b64 },
					opts?.keepalive
				);
				return;
			} catch (e) {
				console.warn("gzip failed, fallback to plain:", e);
			}
		}

		await sendPayload(
			`${apiBase}/events`,
			{ ...payloadBase, events },
			opts?.keepalive
		);
	};

	/**
	 * 串行上传：依次发送盘中“未发送”的批次（遇错退出，等下次触发）
	 * @param curSessionId 会话 ID
	 * @param opts keepalive 选项
	 */
	const processPendingQueue = async (
		curSessionId: string,
		opts?: KeepaliveOptions
	): Promise<void> => {
		if (!curSessionId) return;
		if (uploadingRef.current) return; // 已有循环在跑

		uploadingRef.current = true;
		try {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const rows = (await idbGetUnsentBatches(curSessionId)) as StoredBatch[];
				if (!rows.length) break;

				for (let i = 0; i < rows.length; i += 1) {
					const row = rows[i];
					try {
						await postBatch(curSessionId, row.events, opts);
						if (OBSERVE_MODE) {
							await idbMarkSent(row.id); // 标记 sentAt，下一轮就不会再被取到
						} else {
							await idbDeleteBatch(row.id); // 线上模式直接删除
						}
					} catch (e) {
						console.warn("send one batch failed, will retry later:", e);
						await new Promise((r) => setTimeout(r, 1000)); // 轻微退避，防止打满
						return; // 遇错退出，等待心跳/flush/下次触发
					}
				}
			}
		} finally {
			uploadingRef.current = false;
		}
	};

	/**
	 * flush：把内存中的事件出队，先落盘，再视情况驱动上传队列
	 * - 常规：落盘后调用队列发送
	 * - keepalive：若估算体积 > 阈值，仅落盘不发网（避免浏览器丢弃），否则小包尝试 keepalive 发送
	 */
	const flush = async (
		curSessionId: string,
		opts?: KeepaliveOptions
	): Promise<void> => {
		if (!curSessionId || buffer.current.length === 0) return;

		const batch = buffer.current.slice();
		buffer.current = [];

		// 估算未压缩体积（保守估）
		const estimatedBytes = roughSizeOf(batch);

		// 先落盘，保证数据安全
		await idbPutBatch({
			sessionId: curSessionId,
			seq: seqRef.current++,
			createdAt: Date.now(),
			events: batch,
		});

		// 超上限则从最旧开始裁剪（不影响当前新增这批）
		idbPruneByCap(curSessionId, MAX_PENDING_BATCHES).catch((err) =>
			console.warn("idbPruneByCap error", err)
		);

		// keepalive 场景：页面关闭兜底时，大于阈值就只入库不发网
		if (opts?.keepalive) {
			if (estimatedBytes > KEEPALIVE_MAX_BYTES) return;
			try {
				await processPendingQueue(curSessionId, { keepalive: true });
			} catch (e) {
				console.warn("flush(keepalive)->processPendingQueue error:", e);
			}
			return;
		}

		// 常规：正常驱动上传队列
		try {
			await processPendingQueue(curSessionId);
		} catch (e) {
			console.warn("flush->processPendingQueue error:", e);
		}
	};

	/** ========== 定时 flush 启停 ========== */
	const scheduleFlush = (curSessionId: string): void => {
		if (flushTimer.current) return;
		flushTimer.current = window.setInterval(() => {
			void flush(curSessionId);
		}, BATCH_INTERVAL);
	};
	const stopScheduleFlush = (): void => {
		if (flushTimer.current) {
			window.clearInterval(flushTimer.current);
			flushTimer.current = null;
		}
	};

	/**
	 * 心跳自检：
	 * 1) 把内存未出队的事件 flush 一下；
	 * 2) 驱动上传队列把盘中未发送批次推走；
	 * 3) 每 6 次（约 60s）做一次老化清理；
	 * 4) 观测模式下，做“延迟删除”清理（把 sentAt 早于 DELAY_DELETE_MS 的记录删掉）。
	 */
	const startHeartbeat = (curSessionId: string): void => {
		if (heartbeatTimer.current) return;
		heartbeatTimer.current = window.setInterval(async () => {
			try {
				if (buffer.current.length) {
					await flush(curSessionId);
				}
				await processPendingQueue(curSessionId);

				cleanTickRef.current = (cleanTickRef.current + 1) % 6;
				if (cleanTickRef.current === 0) {
					idbPruneByAge(MAX_AGE_DAYS)
						.then(({ pruned }) => {
							if (pruned) console.log("[IDB] aged prune:", pruned);
						})
						.catch((err) => console.warn("idbPruneByAge error", err));
				}

				if (OBSERVE_MODE) {
					const cutoff = Date.now() - DELAY_DELETE_MS;
					idbDeleteSentBefore(cutoff)
						.then((n) => {
							if (n) console.log("[IDB] delayed delete:", n);
						})
						.catch((err) => console.warn("delayed delete error", err));
				}
			} catch (e) {
				console.warn("heartbeat tick error:", e);
			}
		}, HEARTBEAT_INTERVAL);
	};

	const stopHeartbeat = (): void => {
		if (heartbeatTimer.current) {
			window.clearInterval(heartbeatTimer.current);
			heartbeatTimer.current = null;
		}
	};

	/**
	 * 续传：启动/开始录制时扫描未发批次并发起上传
	 */
	const resumePending = async (curSessionId: string): Promise<void> => {
		if (!curSessionId || resumingRef.current) return;
		resumingRef.current = true;
		try {
			await processPendingQueue(curSessionId);
		} finally {
			resumingRef.current = false;
		}
	};

	/**
	 * 创建会话 ID
	 */
	const createSession = async (): Promise<string> => {
		const r = await fetch(`${apiBase}/session`, { method: "POST" });
		const data: { sessionId: string } = await r.json();
		return data.sessionId;
	};

	/** 开始录制 */
	const handleStartRecord = async (): Promise<void> => {
		let curSessionId = sessionId;
		if (!curSessionId) {
			curSessionId = await createSession();
			setSessionId(curSessionId);
		}

		// 开始前先做一次历史续传
		await resumePending(curSessionId);

		// 启动 rrweb
		const stop = record({
			emit(event: eventWithTime) {
				buffer.current.push(event);

				const tooMany = buffer.current.length >= BATCH_SIZE;
				const tooBig = roughSizeOf(buffer.current) >= MAX_BATCH_BYTES;

				if (tooMany || tooBig) {
					void flush(curSessionId); // fire-and-forget，避免阻塞 emit
				}
			},
			// 隐私/采集策略（按需调整）
			maskAllInputs: true,
			blockClass: "rr-block",
			ignoreClass: "rr-ignore",
			maskTextClass: "rr-mask",
			inlineStylesheet: true,
			recordCanvas: true,
			slimDOMOptions: {
				script: true,
				comment: true,
				headFavicon: true,
				headWhitespace: true,
			},
		});

		if (stop) {
			stopFn.current = stop;
		}

		// 启动周期 flush + 心跳
		scheduleFlush(curSessionId);
		startHeartbeat(curSessionId);

		setIsRecording(true);
		console.log("recording started", { curSessionId });
	};

	/** 停止录制 */
	const handleStopRecord = async (): Promise<void> => {
		if (stopFn.current) {
			stopFn.current();
			stopFn.current = null;
		}

		stopScheduleFlush();
		stopHeartbeat();

		// 把内存 buffer 最后一批入库并尝试发送（真正发送由队列统一完成）
		await flush(sessionId);
		await processPendingQueue(sessionId);

		setIsRecording(false);
		console.log("recording stopped");
	};

	/** 页面生命周期兜底：隐藏/关闭时尽量把内存入库并触发一次发送（小包走 keepalive） */
	useEffect(() => {
		const onHidden = () => {
			if (!sessionId) return;
			void flush(sessionId, { keepalive: true });
			// 提示：keepalive/sendBeacon 体积有限，核心策略仍是“平时勤快清空”
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") onHidden();
		};

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pagehide", onHidden);

		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pagehide", onHidden);
		};
	}, [sessionId]);

	/** ========== UI ========== */
	return (
		<Main>
			<h2>RRWeb 录制 Demo</h2>

			<div className="row">
				<button
					id="btnStart"
					type="button"
					disabled={isRecording}
					onClick={handleStartRecord}
				>
					开始录制
				</button>
				<button
					id="btnStop"
					type="button"
					disabled={!isRecording}
					onClick={handleStopRecord}
				>
					停止录制
				</button>
			</div>

			<div className="row tip">
				隐私提示：已默认 maskAllInputs（表单打码），你也可以对特定 DOM 使用
				<code>.rr-block</code> / <code>.rr-mask</code> 类控制录制粒度。
			</div>
		</Main>
	);
};

export default RecordComponent;
