import { useEffect, useRef, useState } from "react";

import { Player } from "rrweb-player";
import type { eventWithTime } from "@rrweb/types";

import "rrweb-player/dist/style.css";
import { Main } from "./index.styled";

/** ========= 类型声明 ========= */

/** /sessions 列表接口响应 */
interface ListSessionsResp {
	sessions: string[];
}

/** /sessions/:id 事件接口响应 */
interface SessionEventsResp {
	events: eventWithTime[];
}

/** rrweb-player 的最小可用实例类型（Svelte 组件实例） */
interface RRWebPlayerInstance {
	/** 取到底层 Replayer（可能不存在或类型无定义，做最小防御） */
	getReplayer?: () => { destroy?: () => void } | undefined;
	/** Svelte 组件实例的标准销毁钩子 */
	$destroy?: () => void;
}

/** 组件内状态与引用的类型 */
type PlayerRef = RRWebPlayerInstance | null;

/** 后端基础路径（按需改成你的网关地址） */
const apiBase = "https://rrweb-server.shenck215.workers.dev";

/** ========= 组件 ========= */

const ReplayComponent: React.FC = () => {
	/** 会话列表 */
	const [sessions, setSessions] = useState<string[]>([]);
	/** 当前选择的会话 ID */
	const [sessionId, setSessionId] = useState<string>("");

	/** rrweb-player 实例引用（用于销毁和复用） */
	const playerRef = useRef<PlayerRef>(null);
	/** 播放器挂载容器 */
	const containerRef = useRef<HTMLDivElement>(null);

	/** 安全销毁已存在的 player 实例，并清空挂载点 */
	const unmount = (): void => {
		// 1) 尝试销毁底层 Replayer
		try {
			playerRef.current?.getReplayer?.()?.destroy?.();
		} catch {
			/* noop */
		}
		// 2) 销毁 Svelte 组件实例
		try {
			playerRef.current?.$destroy?.();
		} catch {
			/* noop */
		}
		// 3) 清空挂载容器
		if (containerRef.current) {
			containerRef.current.innerHTML = "";
		}
		// 4) 引用归零
		playerRef.current = null;
	};

	/**
	 * 列出所有 sessionId
	 * - 从后端拉取列表并展示
	 */
	const handleShowSessions = async (): Promise<void> => {
		const r = await fetch(`${apiBase}/sessions/list`, {
			method: "POST",
		});
		const data: ListSessionsResp = await r.json();
		setSessions(data.sessions ?? []);
	};

	/**
	 * 加载并播放指定 session
	 * - 从后端获取事件数组
	 * - 实例化 rrweb-player 并自动播放
	 */
	const handleLoadSession = async (): Promise<void> => {
		if (!sessionId) {
			alert("请填写 sessionId");
			return;
		}

		// 拉取该会话事件
		const r = await fetch(`${apiBase}/sessions/get`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId }),
		});
		const data: SessionEventsResp = await r.json();
		const events = data.events ?? [];

		// rrweb-player 至少需要 2 条事件才能播放
		if (events.length < 2) {
			alert(
				"该会话事件不足 2 条，请重新录制（开始录制后做几次点击/输入/滚动，再停止）"
			);
			return;
		}

		const target = containerRef.current;
		if (!target) return;

		// 如有已存在实例，先完整销毁（兼容 React.StrictMode 双执行）
		unmount();

		// 注意：rrweb-player 是 Svelte 组件，使用 props 传参
		playerRef.current = new Player({
			target,
			props: {
				events, // 必填：事件数组（eventWithTime[]）
				showController: true, // 控制条
				width: 1000,
				height: 600,
				autoPlay: true,
				speedOption: [0.5, 1, 2, 4],
				// 也可透传更多 Replayer 配置，如 mouseTail, liveMode, root 等
			},
		});
	};

	/**
	 * 清空后端所有 sessions（调试用）
	 * - 先卸载本地播放器
	 * - 调用 DELETE /sessions
	 * - 重新拉取空列表
	 */
	const handleClearSessions = async (): Promise<void> => {
		unmount();
		setSessionId("");
		await fetch(`${apiBase}/sessions/clear`, { method: "POST" });
		await handleShowSessions();
	};

	/** 组件卸载时，确保播放器被销毁，释放 DOM 与内存 */
	useEffect(() => {
		return () => {
			unmount();
		};
	}, []);

	return (
		<Main>
			<h2>RRWeb 回放 Demo</h2>

			<div className="row">
				<div>会话ID：</div>
				<input
					id="sessionId"
					placeholder="从 /sessions 里挑一个"
					value={sessionId}
					onChange={(e) => setSessionId(e.target.value)}
				/>
				<button id="btnLoad" type="button" onClick={handleLoadSession}>
					加载并播放
				</button>
				<button id="btnList" type="button" onClick={handleShowSessions}>
					列出会话
				</button>
				<button id="btnClear" type="button" onClick={handleClearSessions}>
					清空会话
				</button>
			</div>

			<div className="row">
				<div>Sessions:</div>
				{sessions.map((s) => (
					<div key={s}>{s}</div>
				))}
			</div>

			{/* 挂载点只用 ref，不再用 getElementById */}
			<div ref={containerRef} className="row" />
		</Main>
	);
};

export default ReplayComponent;
