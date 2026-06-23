/**
 * ContextMenu — Dark-styled right-click context menu with submenu support.
 * ════════════════════════════════════════════════════════════════════════════
 * Usage:
 *   const { showContextMenu, ContextMenuPortal } = useContextMenu();
 *
 *   <div onContextMenu={(e) => showContextMenu(e, [
 *     { label: 'Cut', shortcut: 'Ctrl+X', onClick: handleCut },
 *     { type: 'separator' },
 *     { label: 'Paste', disabled: true },
 *     { label: 'More', children: [
 *       { label: 'Sub Item 1', onClick: handleSub1 },
 *     ]},
 *   ])}>
 *     ...content...
 *   </div>
 *   <ContextMenuPortal />
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
    type?: 'item' | 'separator';
    label?: string;
    shortcut?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    danger?: boolean;
    onClick?: () => void;
    children?: ContextMenuItem[];
}

// ─── Submenu Component ───────────────────────────────────────────────────────

const ContextMenuList: React.FC<{
    items: ContextMenuItem[];
    onClose: () => void;
    isSubmenu?: boolean;
}> = ({ items, onClose, isSubmenu }) => {
    const [activeSubmenuIdx, setActiveSubmenuIdx] = useState<number | null>(null);
    const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = (idx: number, hasChildren: boolean) => {
        if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
        if (hasChildren) {
            submenuTimerRef.current = setTimeout(() => setActiveSubmenuIdx(idx), 150);
        } else {
            setActiveSubmenuIdx(null);
        }
    };

    const handleMouseLeave = () => {
        if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    };

    return (
        <div
            className={clsx(
                'py-1.5 min-w-[180px] max-w-[280px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 backdrop-blur-xl shadow-2xl shadow-black/50',
                isSubmenu && 'ml-1',
            )}
            role="menu"
        >
            {items.map((item, idx) => {
                if (item.type === 'separator') {
                    return (
                        <div
                            key={`sep-${idx}`}
                            className="my-1.5 mx-3 h-px bg-white/8"
                        />
                    );
                }

                const hasChildren = !!item.children?.length;
                const isActive = activeSubmenuIdx === idx;

                return (
                    <div
                        key={`${item.label}-${idx}`}
                        className="relative"
                        onMouseEnter={() => handleMouseEnter(idx, hasChildren)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <button
                            disabled={item.disabled}
                            onClick={() => {
                                if (hasChildren) return;
                                item.onClick?.();
                                onClose();
                            }}
                            className={clsx(
                                'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors',
                                item.disabled
                                    ? 'text-white/20 cursor-not-allowed'
                                    : item.danger
                                      ? 'text-red-400 hover:bg-red-500/15'
                                      : 'text-white/80 hover:bg-white/8 hover:text-white',
                            )}
                            role="menuitem"
                        >
                            {/* Icon */}
                            {item.icon && (
                                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-white/40">
                                    {item.icon}
                                </span>
                            )}

                            {/* Label */}
                            <span className="flex-1 text-left truncate">
                                {item.label}
                            </span>

                            {/* Shortcut or Submenu Arrow */}
                            {hasChildren ? (
                                <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
                            ) : item.shortcut ? (
                                <span className="text-[10px] text-white/25 font-mono ml-4 flex-shrink-0">
                                    {item.shortcut}
                                </span>
                            ) : null}
                        </button>

                        {/* Nested submenu */}
                        {hasChildren && isActive && item.children && (
                            <div className="absolute left-full top-0 z-50">
                                <ContextMenuList
                                    items={item.children}
                                    onClose={onClose}
                                    isSubmenu
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
}

export function useContextMenu() {
    const [state, setState] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        items: [],
    });

    const showContextMenu = useCallback(
        (e: React.MouseEvent, items: ContextMenuItem[]) => {
            e.preventDefault();
            e.stopPropagation();

            // Position with viewport boundary awareness
            const x = Math.min(e.clientX, window.innerWidth - 200);
            const y = Math.min(e.clientY, window.innerHeight - 200);

            setState({ visible: true, x, y, items });
        },
        [],
    );

    const close = useCallback(() => {
        setState((s) => ({ ...s, visible: false }));
    }, []);

    // Close on Escape or outside click
    useEffect(() => {
        if (!state.visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };

        const handleClick = () => close();

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('click', handleClick);
        // Use capture phase to close before any other handler fires
        window.addEventListener('contextmenu', handleClick, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('click', handleClick);
            window.removeEventListener('contextmenu', handleClick, true);
        };
    }, [state.visible, close]);

    // Portal component
    const ContextMenuPortal: React.FC = () => {
        if (!state.visible) return null;

        return createPortal(
            <div
                className="fixed z-[9999]"
                style={{ left: state.x, top: state.y }}
            >
                <ContextMenuList items={state.items} onClose={close} />
            </div>,
            document.body,
        );
    };

    return { showContextMenu, ContextMenuPortal, closeContextMenu: close };
}
