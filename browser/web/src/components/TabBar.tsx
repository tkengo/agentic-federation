import { RiCloseLine } from "@remixicon/react";

interface TabItem {
  path: string;
  loading?: boolean;
  hasError?: boolean;
}

interface Props {
  tabs: TabItem[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}

export function TabBar({ tabs, activePath, onActivate, onClose }: Props): React.ReactElement | null {
  if (tabs.length === 0) return null;
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => {
        const basename = tab.path.split("/").pop() ?? tab.path;
        const isActive = tab.path === activePath;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            className={`tab${isActive ? " tab--active" : ""}${tab.hasError ? " tab--error" : ""}`}
            title={tab.path}
            onClick={() => onActivate(tab.path)}
            onMouseDown={(e) => {
              // Middle click closes
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.path);
              }
            }}
          >
            <span className="tab__name">{basename}</span>
            <button
              type="button"
              className="tab__close"
              aria-label={`Close ${basename}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              <RiCloseLine size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
