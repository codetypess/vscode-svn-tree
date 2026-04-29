export interface ViewportMenuPosition {
    x: number;
    y: number;
}

export const contextMenuViewportMarginPx = 8;
export const contextMenuMaxWidthPx = 360;
export const contextMenuEstimatedHeightPx = 196;

export function constrainMenuPosition(
    position: ViewportMenuPosition,
    menuWidth: number,
    menuHeight: number,
    viewportWidth: number,
    viewportHeight: number
): ViewportMenuPosition {
    const safeViewportWidth = Math.max(0, viewportWidth);
    const safeViewportHeight = Math.max(0, viewportHeight);
    const availableWidth = Math.max(
        0,
        safeViewportWidth - contextMenuViewportMarginPx * 2
    );
    const availableHeight = Math.max(
        0,
        safeViewportHeight - contextMenuViewportMarginPx * 2
    );
    const safeMenuWidth = Math.min(Math.max(0, menuWidth), availableWidth);
    const safeMenuHeight = Math.min(Math.max(0, menuHeight), availableHeight);
    const maxX = Math.max(
        contextMenuViewportMarginPx,
        safeViewportWidth - contextMenuViewportMarginPx - safeMenuWidth
    );
    const maxY = Math.max(
        contextMenuViewportMarginPx,
        safeViewportHeight - contextMenuViewportMarginPx - safeMenuHeight
    );

    return {
        x: Math.max(
            contextMenuViewportMarginPx,
            Math.min(position.x, maxX)
        ),
        y: Math.max(
            contextMenuViewportMarginPx,
            Math.min(position.y, maxY)
        ),
    };
}
