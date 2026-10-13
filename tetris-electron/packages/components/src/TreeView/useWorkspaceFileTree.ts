import {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import type { TreeNode } from '@tetris/shared/types';
import {
	isSubpath,
	joinPath,
	parentPath,
	splitPathSegments,
} from '@tetris/shared/path-utils';
import type { FlatItem } from './useFileTree';
import {
	flattenTree,
	hydrateNode,
	treesEqual,
	saveExpandedDirs,
} from './useFileTree';
import type { SortMode } from './types';
import { visibleDirectoryPaths, queueDirectoryRead } from './directory-loading';

export interface WorkspaceFileTreeHandle {
	flatItems: FlatItem[];
	navigableItems: FlatItem[];
	expandAncestors: (filePath: string) => void;
	expandRecursive: (rootPath: string) => void;
	collapseAllDirs: () => void;
	refresh: (directory?: string) => Promise<void>;
}

export function useWorkspaceFileTree(
	workspacePath: string,
	sortMode: SortMode,
	enabled = true,
) {
	const [dirContents, setDirContents] = useState<
		Map<string, TreeNode[]>
	>(new Map());
	const [expandedDirs, setExpandedDirs] = useState<
		Set<string>
	>(new Set);
	const dirContentsRef = useRef(dirContents);
	dirContentsRef.current = dirContents;
	const pendingLoadsRef = useRef(new Map<string, Promise<TreeNode[]>>());
	const dirtyDirsRef = useRef(new Set<string>());
	const errorsRef = useRef(new Map<string, unknown>());
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const expandedRef = useRef(expandedDirs);
	expandedRef.current = expandedDirs;
	const prefsLoadedRef = useRef(false);

	const loadDir = useCallback(async (dirPath: string, force = false): Promise<TreeNode[]> => {
		if (force) dirtyDirsRef.current.add(dirPath);
		const pending = pendingLoadsRef.current.get(dirPath);
		if (pending) {
			return force ? pending.then(() => loadDir(dirPath)) : pending;
		}
		const cached = dirContentsRef.current.get(dirPath);
		if (cached && !dirtyDirsRef.current.has(dirPath)) return cached;
		dirtyDirsRef.current.delete(dirPath);
		const request = queueDirectoryRead(async () => {
			try {
				const entries = await window.api.readDir(dirPath);
				const children: TreeNode[] = entries.map((e) => ({
					name: e.name,
					path: joinPath(dirPath, e.name),
					kind: e.isDirectory ? 'folder' as const : 'file' as const,
					ctime: e.createdAt,
					mtime: e.modifiedAt,
				})).sort((a, b) => {
					if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
				errorsRef.current.delete(dirPath);
				const prev = dirContentsRef.current;
				if (!prev.has(dirPath) || !treesEqual(prev.get(dirPath)!, children)) {
					const next = new Map(prev);
					next.set(dirPath, children);
					// Remove cached branches whose immediate parent was deleted or replaced.
					const folders = new Set(children.filter((n) => n.kind === 'folder').map((n) => n.path));
					for (const path of next.keys()) {
						if (path === dirPath || !isSubpath(dirPath, path)) continue;
						const child = joinPath(dirPath, splitPathSegments(path.slice(dirPath.length + 1))[0]!);
						if (!folders.has(child)) next.delete(path);
					}
					dirContentsRef.current = next;
					setDirContents(next);
				}
				return children;
			} catch (err) {
				errorsRef.current.set(dirPath, err);
				console.error(`Failed to load dir ${dirPath}:`, err);
				if (!dirContentsRef.current.has(dirPath)) {
					const next = new Map(dirContentsRef.current);
					next.set(dirPath, []);
					dirContentsRef.current = next;
					setDirContents(next);
				}
				return [];
			} finally {
				pendingLoadsRef.current.delete(dirPath);
			}
		});
		pendingLoadsRef.current.set(dirPath, request);
		return request;
	}, []);

	// Collapsed workspaces do no filesystem or preference I/O.
	useEffect(() => {
		if (!enabled || prefsLoadedRef.current) return;
		prefsLoadedRef.current = true;
		window.api.getWorkspacePref('expanded_dirs', workspacePath).then((dirs) => {
			if (Array.isArray(dirs)) {
				setExpandedDirs((prev) => new Set([...dirs.filter((p): p is string =>
					typeof p === 'string' && isSubpath(workspacePath, p)), ...prev]));
			}
		}).catch(() => {});
	}, [enabled, workspacePath]);

	// Restore expanded branches only when every ancestor is visible.
	useEffect(() => {
		if (!enabled) return;
		for (const path of visibleDirectoryPaths(workspacePath, expandedDirs, dirContents)) {
			if (!dirContents.has(path) || dirtyDirsRef.current.has(path)) void loadDir(path);
		}
	}, [enabled, workspacePath, expandedDirs, dirContents, loadDir]);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const invalidate = (paths: string[]) => {
			for (const path of paths) {
				if (path === workspacePath || isSubpath(workspacePath, path)) dirtyDirsRef.current.add(path);
			}
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				if (!enabledRef.current) return;
				for (const path of visibleDirectoryPaths(workspacePath, expandedRef.current, dirContentsRef.current)) {
					if (dirtyDirsRef.current.has(path)) void loadDir(path, true);
				}
			}, 250);
		};
		const unsubscribe = window.api.onFsChanged((events) => invalidate(events.map((e) => e.dirPath)));
		const unsubscribeRename = window.api.onFileRenamed((oldPath, newPath) => invalidate([parentPath(oldPath), parentPath(newPath)]));
		return () => {
			unsubscribe();
			unsubscribeRename();
			if (timer) clearTimeout(timer);
		};
	}, [workspacePath, loadDir]);

	const refresh = useCallback(async (directory = workspacePath) => {
		if (directory !== workspacePath && !isSubpath(workspacePath, directory)) return;
		await window.api.invalidateDirectory(directory);
		for (const path of dirContentsRef.current.keys()) {
			if (path === directory || isSubpath(directory, path)) dirtyDirsRef.current.add(path);
		}
		await loadDir(directory, true);
		if (errorsRef.current.has(directory)) throw errorsRef.current.get(directory);
		// Refresh visible descendants only; hidden branches reload on their next expansion.
		for (const path of visibleDirectoryPaths(workspacePath, expandedRef.current, dirContentsRef.current)) {
			if (path !== directory && isSubpath(directory, path) && dirtyDirsRef.current.has(path) &&
				visibleDirectoryPaths(workspacePath, expandedRef.current, dirContentsRef.current).includes(path)) {
				await loadDir(path);
				if (errorsRef.current.has(path)) throw errorsRef.current.get(path);
			}
		}
	}, [workspacePath, loadDir]);

	// Hydrate + flatten
	const hydratedTree = useMemo(() => {
		const children =
			dirContents.get(workspacePath) ?? [];
		return children.map((child) =>
			hydrateNode(child, dirContents),
		);
	}, [workspacePath, dirContents]);

	const flatItems = useMemo(() => {
		const items = flattenTree(
			hydratedTree,
			expandedDirs,
			0,
			sortMode,
			1,
		);
		return items.map((item) => ({
			...item,
			workspacePath,
		}));
	}, [
		hydratedTree,
		expandedDirs,
		sortMode,
		workspacePath,
	]);

	const navigableItems = useMemo(
		() =>
			flatItems.filter(
				(item) => item.kind === 'file',
			),
		[flatItems],
	);

	// Expand/collapse logic
	const expandRecursive = useCallback(
		async (rootPath: string) => {
			const toExpand: string[] = [];

			async function collect(path: string) {
				toExpand.push(path);
				const cached =
					dirContentsRef.current.get(path);
				const children =
					cached ?? (await loadDir(path));
				const subs = children.filter(
					(n) => n.kind === 'folder',
				);
				await Promise.all(
					subs.map((s) => collect(s.path)),
				);
			}

			await collect(rootPath);

			setExpandedDirs((prev) => {
				const next = new Set(prev);
				for (const p of toExpand) next.add(p);
				saveExpandedDirs(next, workspacePath);
				return next;
			});
		},
		[workspacePath, loadDir],
	);

	const collapseAllDirs = useCallback(() => {
		setExpandedDirs((prev) => {
			const next = new Set<string>();
			for (const p of prev) {
				if (
					p !== workspacePath &&
					!isSubpath(workspacePath, p)
				) {
					next.add(p);
				}
			}
			saveExpandedDirs(next, workspacePath);
			return next;
		});
	}, [workspacePath]);

	const toggleExpand = useCallback(
		(path: string, recursive = false) => {
			const isOpen = expandedDirs.has(path);

			if (isOpen) {
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					if (recursive) {
						for (const p of prev) {
							if (
								p === path ||
								isSubpath(path, p)
							) {
								next.delete(p);
							}
						}
					} else {
						next.delete(path);
					}
					saveExpandedDirs(
						next,
						workspacePath,
					);
					return next;
				});
			} else if (recursive) {
				expandRecursive(path);
			} else {
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					next.add(path);
					saveExpandedDirs(
						next,
						workspacePath,
					);
					return next;
				});
				if (!dirContents.has(path)) {
					loadDir(path);
				}
			}
		},
		[
			dirContents,
			loadDir,
			expandedDirs,
			expandRecursive,
			workspacePath,
		],
	);

	const expandFolder = useCallback(
		(path: string) => {
			if (expandedDirs.has(path)) return;
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				next.add(path);
				saveExpandedDirs(
					next,
					workspacePath,
				);
				return next;
			});
			if (!dirContents.has(path)) {
				loadDir(path);
			}
		},
		[expandedDirs, dirContents, loadDir, workspacePath],
	);

	const expandAncestors = useCallback(
		(filePath: string) => {
			if (!isSubpath(workspacePath, filePath))
				return;

			const relative = filePath.slice(
				workspacePath.length + 1,
			);
			const parts = splitPathSegments(relative);
			parts.pop();

			const dirsToExpand: string[] = [];
			let current = workspacePath;
			for (const part of parts) {
				current = joinPath(current, part);
				dirsToExpand.push(current);
			}

			setExpandedDirs((prev) => {
				if (
					dirsToExpand.every((p) =>
						prev.has(p),
					)
				)
					return prev;
				const next = new Set(prev);
				for (const p of dirsToExpand)
					next.add(p);
				saveExpandedDirs(
					next,
					workspacePath,
				);
				return next;
			});

			for (const p of dirsToExpand) {
				if (!dirContentsRef.current.has(p)) {
					loadDir(p);
				}
			}
		},
		[workspacePath, loadDir],
	);

	return {
		refresh,
		flatItems,
		expandedDirs,
		toggleExpand,
		expandFolder,
		expandAncestors,
		expandRecursive,
		collapseAllDirs,
		navigableItems,
	};
}
