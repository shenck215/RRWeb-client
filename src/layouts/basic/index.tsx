import { useCallback } from "react";
import { history, Outlet, useLocation } from "umi";

import styles from "./index.less";
import classNames from "classnames";
import RecordComponent from "@/components/RRWeb/record";

const BasicLayout = () => {
	const { pathname } = useLocation();

	const linkTo = useCallback(
		(path: string) => {
			if (path === pathname) return;
			history.push(path);
		},
		[pathname]
	);

	return (
		<div className={styles.basic}>
			<div>
				<RecordComponent />
			</div>
			<div className={styles.menu}>
				<div
					className={classNames(styles.menuItem, {
						[styles.selected]: pathname === "/",
					})}
					onClick={() => linkTo("/")}
				>
					首页
				</div>
				<div
					className={classNames(styles.menuItem, {
						[styles.selected]: pathname === "/form",
					})}
					onClick={() => linkTo("/form")}
				>
					表单页
				</div>
				<div
					className={classNames(styles.menuItem, {
						[styles.selected]: pathname === "/replay",
					})}
					onClick={() => linkTo("/replay")}
				>
					回放页
				</div>
			</div>
			<div className={styles.content}>
				<Outlet />
			</div>
		</div>
	);
};

export default BasicLayout;
