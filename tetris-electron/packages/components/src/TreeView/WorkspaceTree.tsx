import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { TreeNode } from '@tetris/shared/types';
import {
	useWorkspaceFileTree,
} from './useWorkspaceFileTree';
import type { WorkspaceFileTreeHandle } from './useWorkspaceFileTree';
import type { FlatItem } from './useFileTree';
import type { SortMode } from './types';
import { getDateKey, formatDateLabel } from './Helpers';
import { TreeView } from './TreeView';
import { FolderRow } from './TreeView';

export interface WorkspaceTreeProps {
	workspace: { path: string; name: string };
	isExpanded: boolean;
	onToggleExpand: (
		path: string,
		recursive: boolean,
	) => void;
	onDirectoryActive?: (path: string) => void;
	selectedPath: string | null;
	selectedPaths: Set<string>;
	onItemClick: (
		path: string,
		e: { metaKey: boolean; shiftKey: boolean },
	) => void;
	onCreateFile: (
		folderPath: string,
		name: string,
	) => void;
	onPlusClick?: (folderPath: string) => void;
	onDeleteFile?: (path: string) => void;
	onContextMenu?: (
		e: React.MouseEvent,
		item: FlatItem | null,
	) => void;
	sortMode: SortMode;
	renamingPath?: string | null;
	renameValue?: string;
	renameInputRef?: React.RefObject<HTMLInputElement | null>;
	onRenameChange?: (value: string) => void;
	onRenameConfirm?: () => void;
	onRenameCancel?: () => void;
	onDragStart?: (
		e: React.DragEvent,
		path: string,
	) => void;
	onDragOver?: (
		e: React.DragEvent,
		folderPath: string,
	) => void;
	onDragLeave?: () => void;
	onDrop?: (
		e: React.DragEvent,
		targetFolder: string,
	) => void;
	onDragEnd?: () => void;
	dropTargetPath?: string | null;
	onSelectFolder?: (path: string) => void;
	isFirstWorkspace?: boolean;
	searchQuery?: string;
	listView?: boolean;
	initialExpandAll?: boolean;
	onExpandAllComplete?: (wsPath: string) => void;
}

function flattenAllFiles(
	nodes: TreeNode[],
	workspacePath: string,
): FlatItem[] {
	const items: FlatItem[] = [];
	const prefix = workspacePath.length + 1;
	function walk(children: TreeNode[]) {
		for (const node of children) {
			if (node.kind === 'file') {
				items.push({
					id: node.path,
					kind: 'file',
					level: 1,
					name: node.path.slice(prefix),
					path: node.path,
					ctime: node.ctime,
					mtime: node.mtime,
					workspacePath,
				});
			}
			if (node.children) {
				walk(node.children);
			}
		}
	}
	walk(nodes);
	return items;
}

export const WorkspaceTree = forwardRef<
	WorkspaceFileTreeHandle,
	WorkspaceTreeProps
>(function WorkspaceTree(
	{
		workspace,
		isExpanded,
		onToggleExpand,
		onDirectoryActive,
		selectedPath,
		selectedPaths,
		onItemClick,
		onCreateFile,
		onPlusClick,
		onDeleteFile,
		onContextMenu,
		sortMode,
		renamingPath,
		renameValue,
		renameInputRef,
		onRenameChange,
		onRenameConfirm,
		onRenameCancel,
		onDragStart,
		onDragOver,
		onDragLeave,
		onDrop,
		onDragEnd,
		dropTargetPath,
		onSelectFolder,
		isFirstWorkspace = false,
		searchQuery,
		listView = false,
		initialExpandAll = false,
		onExpandAllComplete,
	},
	ref,
) {
	const {
		flatItems,
		toggleExpand: toggleDirExpand,
		expandFolder,
		expandAncestors,
		expandRecursive,
		collapseAllDirs,
		refresh: refreshTree,
		navigableItems,
	} = useWorkspaceFileTree(
		workspace.path,
		sortMode,
		isExpanded,
	);

	// Handle initialExpandAll on mount
	useEffect(() => {
		if (initialExpandAll) {
			expandRecursive(workspace.path);
			onExpandAllComplete?.(workspace.path);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount when flag is set
	}, [initialExpandAll]);

	// Per-workspace search
	const [allFiles, setAllFiles] = useState<
		FlatItem[] | null
	>(null);
	const isSearching =
		(searchQuery ?? '').trim().length > 0;
	const needsAllFiles = isSearching || (listView && isExpanded);
	const [fetchTrigger, setFetchTrigger] = useState(0);
	const [cursor, setCursor] = useState<string | null>(null);
	const [listLoading, setListLoading] = useState(false);
	const [listError, setListError] = useState<string | null>(null);
	const [renderLimit, setRenderLimit] = useState(200);
	const requestVersion = useRef(0);
	const loadingPage = useRef(false);
	const query = (searchQuery ?? '').trim().toLowerCase();

	const refresh = useCallback(async (directory?: string) => {
		await refreshTree(directory);
		setFetchTrigger((v) => v + 1);
	}, [refreshTree]);

	useEffect(() => {
		const version = ++requestVersion.current;
		setAllFiles(null);
		setCursor(null);
		setListError(null);
		setRenderLimit(200);
		loadingPage.current = false;
		setListLoading(needsAllFiles);
		if (!needsAllFiles) return;
		const timer = setTimeout(() => {
			loadingPage.current = true;
			window.api.listWorkspaceFiles({ root: workspace.path, query }).then((page) => {
				if (version !== requestVersion.current) return;
				setAllFiles(flattenAllFiles(page.files, workspace.path));
				setCursor(page.cursor);
			}).catch((err) => {
				if (version === requestVersion.current) setListError(String(err));
			}).finally(() => {
				if (version === requestVersion.current) {
					loadingPage.current = false;
					setListLoading(false);
				}
			});
		}, 300);
		return () => {
			requestVersion.current++;
			clearTimeout(timer);
			window.api.cancelWorkspaceFileList(workspace.path);
		};
	}, [needsAllFiles, workspace.path, query, fetchTrigger]);

	const loadMore = useCallback(async () => {
		if (!cursor || loadingPage.current) return;
		const version = requestVersion.current;
		loadingPage.current = true;
		setListLoading(true);
		setListError(null);
		try {
			const page = await window.api.listWorkspaceFiles({ root: workspace.path, query, cursor });
			if (version !== requestVersion.current) return;
			setAllFiles((prev) => [...(prev ?? []), ...flattenAllFiles(page.files, workspace.path)]);
			setCursor(page.cursor);
			setRenderLimit((v) => v + 200);
		} catch (err) {
			if (version === requestVersion.current) setListError(String(err));
		} finally {
			if (version === requestVersion.current) {
				loadingPage.current = false;
				setListLoading(false);
			}
		}
	}, [workspace.path, query, cursor]);

	const filteredItems = useMemo(() => {
		if (!searchQuery?.trim() && !listView) return flatItems;
		// While allFiles is loading, keep showing the tree view
		if (listView && !allFiles && !searchQuery?.trim()) return flatItems;
		const source = allFiles ?? flatItems;
		let items: FlatItem[];
		if (listView && !searchQuery?.trim()) {
			items = source.filter((item) => item.kind !== 'folder');
		} else {
			const query = searchQuery!.toLowerCase();
			items = source.filter((item) => {
				if (item.kind === 'folder') return false;
				const name = item.name.toLowerCase();
				const slash = name.lastIndexOf('/');
				const fileName =
					slash >= 0
						? name.slice(slash + 1)
						: name;
				return fileName.includes(query);
			});
		}
		// Sort by current sortMode
		const toTime = (v?: string | number): number =>
			typeof v === 'number' ? v : v ? new Date(v).getTime() : 0;
		const basename = (n: string) => {
			const i = n.lastIndexOf('/');
			return i >= 0 ? n.slice(i + 1) : n;
		};
		const cmp = (a: FlatItem, b: FlatItem) => {
			switch (sortMode) {
				case 'alpha-asc':
					return basename(a.name).localeCompare(basename(b.name));
				case 'alpha-desc':
					return basename(b.name).localeCompare(basename(a.name));
				case 'created-desc':
					return toTime(b.ctime) - toTime(a.ctime);
				case 'created-asc':
					return toTime(a.ctime) - toTime(b.ctime);
				case 'modified-desc':
					return toTime(b.mtime) - toTime(a.mtime);
				case 'modified-asc':
					return toTime(a.mtime) - toTime(b.mtime);
				default:
					return 0;
			}
		};
		return items.sort(cmp);
	}, [flatItems, allFiles, searchQuery, listView, sortMode]);

	const renderedItems = useMemo(() => filteredItems.slice(0, renderLimit), [filteredItems, renderLimit]);
	useEffect(() => {
		if (!selectedPath) return;
		const index = filteredItems.findIndex((item) => item.path === selectedPath);
		if (index >= renderLimit) setRenderLimit(Math.ceil((index + 1) / 200) * 200);
	}, [selectedPath, filteredItems, renderLimit]);

	useImperativeHandle(
		ref,
		() => ({
			flatItems,
			navigableItems:
				(isSearching || listView) ? filteredItems : navigableItems,
			expandAncestors,
			expandRecursive,
			collapseAllDirs,
			refresh,
		}),
		[
			flatItems,
			navigableItems,
			isSearching,
			listView,
			filteredItems,
			expandAncestors,
			expandRecursive,
			collapseAllDirs,
			refresh,
		],
	);

	// Group flat items by date or alphabetical initial
	const groupedFlatItems = useMemo(() => {
		if (!listView || isSearching || !allFiles) return null;
		const groups: { key: string; label: string; items: FlatItem[] }[] = [];
		const map = new Map<string, { key: string; label: string; items: FlatItem[] }>();

		if (sortMode.startsWith('alpha')) {
			for (const item of renderedItems) {
				const letter = (item.name.split('/').pop()?.[0] ?? '#').toUpperCase();
				const existing = map.get(letter);
				if (existing) {
					existing.items.push(item);
				} else {
					const group = { key: letter, label: letter, items: [item] };
					map.set(letter, group);
					groups.push(group);
				}
			}
		} else {
			const dateField = sortMode.startsWith('modified') ? 'mtime' : 'ctime';
			for (const item of renderedItems) {
				const ts = item[dateField];
				const tsStr = typeof ts === 'number' ? new Date(ts).toISOString() : (ts ?? '');
				const key = getDateKey(tsStr);
				const existing = map.get(key);
				if (existing) {
					existing.items.push(item);
				} else {
					const group = { key, label: formatDateLabel(tsStr), items: [item] };
					map.set(key, group);
					groups.push(group);
				}
			}
		}

		return groups;
	}, [listView, isSearching, renderedItems, sortMode]);

	const workspaceItem: FlatItem = useMemo(
		() => ({
			id: `ws:${workspace.path}`,
			kind: 'workspace',
			level: 0,
			name: workspace.name,
			path: workspace.path,
			isExpanded,
		}),
		[workspace.path, workspace.name, isExpanded],
	);

	const handleToggleFolder = useCallback(
		(path: string, recursive: boolean) => {
			onDirectoryActive?.(path);
			toggleDirExpand(path, recursive);
		},
		[toggleDirExpand, onDirectoryActive],
	);

	return (
		<div className={`workspace-group${isExpanded ? '' : ' collapsed'}`}>
			<FolderRow
				item={workspaceItem}
				onToggle={(path, recursive) =>
					onToggleExpand(path, recursive)
				}
				onCreateFile={onCreateFile}
				onPlusClick={onPlusClick}
				rowHeight={0}
				isRenaming={false}
				renameValue=""
				renameInputRef={{ current: null }}
				onRenameChange={() => {}}
				onRenameConfirm={() => {}}
				onRenameCancel={() => {}}
				onContextMenu={onContextMenu}
				isDropTarget={
					dropTargetPath === workspace.path
				}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
				isWorkspace
				isFirstWorkspace={isFirstWorkspace}
				hideChevron={isSearching}
			/>
			{(isExpanded || (isSearching && filteredItems.length > 0)) && groupedFlatItems ? (
				groupedFlatItems.map((group) => (
					<div key={group.key}>
						<div className="list-date-separator">
							{group.label}
						</div>
						<TreeView
							flatItems={group.items}
							selectedPath={selectedPath}
							selectedPaths={selectedPaths}
							onItemClick={onItemClick}
							onToggleFolder={handleToggleFolder}
							onCreateFile={onCreateFile}
							onPlusClick={onPlusClick}
							onContextMenu={onContextMenu}
							onDeleteFile={onDeleteFile}
							sortMode={sortMode}
							onCycleSortMode={() => {}}
							renamingPath={renamingPath}
							renameValue={renameValue}
							renameInputRef={renameInputRef}
							onRenameChange={onRenameChange}
							onRenameConfirm={onRenameConfirm}
							onRenameCancel={onRenameCancel}
							dropTargetPath={dropTargetPath}
							onDragStart={onDragStart}
							onDragOver={onDragOver}
							onDragLeave={onDragLeave}
							onDrop={onDrop}
							onDragEnd={onDragEnd}
							workspacePath={workspace.path}
							onSelectFolder={onSelectFolder}
							searchQuery={searchQuery}
						/>
					</div>
				))
			) : (isExpanded || (isSearching && filteredItems.length > 0)) ? (
				<TreeView
					flatItems={renderedItems}
					selectedPath={selectedPath}
					selectedPaths={selectedPaths}
					onItemClick={onItemClick}
					onToggleFolder={
						handleToggleFolder
					}
					onCreateFile={onCreateFile}
					onPlusClick={onPlusClick}
					onContextMenu={onContextMenu}
					onDeleteFile={onDeleteFile}
					sortMode={sortMode}
					onCycleSortMode={() => {}}
					renamingPath={renamingPath}
					renameValue={renameValue}
					renameInputRef={renameInputRef}
					onRenameChange={onRenameChange}
					onRenameConfirm={onRenameConfirm}
					onRenameCancel={onRenameCancel}
					dropTargetPath={dropTargetPath}
					onDragStart={onDragStart}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
					onDragEnd={onDragEnd}
					workspacePath={workspace.path}
					onSelectFolder={onSelectFolder}
					searchQuery={searchQuery}
				/>
			) : null}
			{(isExpanded || isSearching) && filteredItems.length > renderLimit && (
				<button type="button" className="tree-load-more" onClick={() => setRenderLimit((v) => v + 200)}>Show more files</button>
			)}
			{(isExpanded || isSearching) && cursor && filteredItems.length <= renderLimit && (
				<button type="button" className="tree-load-more" disabled={listLoading} onClick={() => void loadMore()}>{listLoading ? 'Loading…' : 'Load more files'}</button>
			)}
			{(isExpanded || isSearching) && listError && <div role="alert" className="tree-refresh-error">{listError} — use Refresh to retry.</div>}

			{(isExpanded || isSearching) &&
				filteredItems.length === 0 && (
					<div className="search-no-matches">
						{listLoading ? 'Loading…' : 'No matching files'}
					</div>
				)}
		</div>
	);
});
