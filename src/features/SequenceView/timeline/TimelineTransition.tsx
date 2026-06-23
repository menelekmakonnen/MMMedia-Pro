import React, { useCallback, memo } from 'react';
import clsx from 'clsx';

interface TransitionData {
  type: string;
  durationFrames: number;
}

interface TimelineTransitionProps {
  transition: TransitionData;
  /** X position in pixels (absolute within the track lane). */
  position: number;
  /** Width in pixels computed from durationFrames × ppf. */
  width: number;
  /** Track height in pixels. */
  height: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
}

/** Short label for each transition type. */
function transitionIcon(type: string): string {
  switch (type) {
    case 'fade':
    case 'fadeblack':
    case 'fadewhite':
      return '◐';
    case 'dissolve':
      return '◑';
    case 'wipeleft':
    case 'wiperight':
    case 'wipeup':
    case 'wipedown':
      return '▤';
    case 'slideleft':
    case 'slideright':
      return '⇋';
    case 'flash':
      return '⚡';
    case 'glitch':
      return '⌇';
    case 'cut':
    default:
      return '✂';
  }
}

export const TimelineTransition: React.FC<TimelineTransitionProps> = memo(({
  transition,
  position,
  width,
  height,
  isSelected = false,
  onSelect,
  onDoubleClick,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
    },
    [onSelect],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.();
    },
    [onDoubleClick],
  );

  if (width < 2) return null;

  return (
    <div
      className={clsx(
        'absolute top-0 flex items-center justify-center cursor-pointer transition-colors z-10',
        'bg-gradient-to-r from-white/5 via-white/10 to-white/5',
        'border-x border-white/10',
        'hover:from-white/10 hover:via-white/15 hover:to-white/10',
        isSelected && 'ring-1 ring-purple-400/60',
      )}
      style={{
        left: position,
        width,
        height,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`Transition: ${transition.type} (${transition.durationFrames}f)`}
    >
      <span className="text-[10px] text-white/50 select-none pointer-events-none">
        {transitionIcon(transition.type)}
      </span>
    </div>
  );
});

TimelineTransition.displayName = 'TimelineTransition';
