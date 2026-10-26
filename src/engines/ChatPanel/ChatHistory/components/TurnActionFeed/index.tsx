import React, { memo, useCallback, useState } from "react";

import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  HugeiconsIcon,
  PencilEdit02Icon,
  ViewIcon,
} from "@src/icons";

import type { ActionFeedItem } from "./actionFeedHelpers";

export interface TurnActionFeedProps {
  items: readonly ActionFeedItem[];
  onActionClick?: (item: ActionFeedItem) => void;
  className?: string;
}

export const TurnActionFeed: React.FC<TurnActionFeedProps> = memo(
  ({ items, onActionClick, className = "" }) => {
    const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

    const toggleItem = useCallback((id: string) => {
      setExpandedIds((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    }, []);

    if (items.length === 0) return null;

    return (
      <div
        className={`my-2 flex flex-col space-y-1 font-mono text-xs ${className}`}
        data-testid="turn-action-feed"
      >
        {items.map((item) => {
          const isExpanded = Boolean(expandedIds[item.id]);

          let icon = null;
          if (item.category === "terminal") {
            icon = (
              <span className="text-[11px] font-bold tracking-tighter text-text-3 select-none">
                {">_"}
              </span>
            );
          } else if (item.category === "read") {
            icon = (
              <HugeiconsIcon
                icon={ViewIcon}
                size={14}
                className="shrink-0 text-text-3"
              />
            );
          } else {
            icon = (
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                size={14}
                className="shrink-0 text-text-3"
              />
            );
          }

          return (
            <div
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border-3/50 bg-fill-2/40 transition-colors hover:bg-fill-2"
            >
              <div
                onClick={() => {
                  toggleItem(item.id);
                  onActionClick?.(item);
                }}
                className="flex cursor-pointer items-center justify-between px-3 py-1.5 select-none"
              >
                <div className="flex min-w-0 items-center gap-2.5 pr-2">
                  <div className="flex w-4 shrink-0 items-center justify-center">
                    {icon}
                  </div>
                  <span className="truncate text-text-2 transition-colors group-hover:text-text-1">
                    {item.title}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.timestamp && (
                    <span className="font-sans text-[11px] text-text-3">
                      {item.timestamp}
                    </span>
                  )}
                  <HugeiconsIcon
                    icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                    size={13}
                    className="text-text-3 transition-colors group-hover:text-text-2"
                  />
                </div>
              </div>

              {/* Expandable Output Drawer */}
              {isExpanded && item.details && (
                <div className="max-h-48 overflow-y-auto border-t border-border-3/40 bg-fill-1/60 px-3 py-2 font-mono text-[11px] break-all whitespace-pre-wrap text-text-3 select-text">
                  {item.details}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

TurnActionFeed.displayName = "TurnActionFeed";

export default TurnActionFeed;
