import { getEffectiveDocumentDirection, getPhysicalLeftFromInlineStart, getRectInlineStart, getViewportInlineSize, type InlineGeometry } from "./direction";

/**
 * Setup dynamic positioning and portaling for interface badge tooltips
 * using a single global tooltip instance to avoid DOM clipping and event loops.
 */
let globalTooltip: HTMLElement | null = null;
let activeContainer: HTMLElement | null = null;
let cleanupActiveTooltip: (() => void) | null = null;

export function setupIfaceboxTooltips() {
  document.addEventListener(
    "mouseover",
    (e) => {
      const target = e.target as HTMLElement | null;
      const container = target?.closest?.(".cbi-tooltip-container") as HTMLElement | null;

      // If mouse moves outside of the tooltip container in the interface column, hide the global tooltip
      if (!container?.closest('td[data-name="_ifacebox"] .ifacebox-body, .td[data-name="_ifacebox"] .ifacebox-body')) {
        cleanupActiveTooltip?.();
        return;
      }

      if (container === activeContainer) {
        return;
      }

      cleanupActiveTooltip?.();

      const localTooltip = container.querySelector(".cbi-tooltip") as HTMLElement | null;
      if (!localTooltip) return;

      // Create the global tooltip element in document.body if it doesn't exist
      if (!globalTooltip) {
        globalTooltip = document.createElement("div");
        globalTooltip.id = "fluent-global-tooltip";
        globalTooltip.className = "cbi-tooltip ifacebadge large";
        globalTooltip.style.position = "absolute";
        globalTooltip.style.zIndex = "10000";
        globalTooltip.style.pointerEvents = "none";
        globalTooltip.style.display = "none";
        document.body.appendChild(globalTooltip);
      }

      activeContainer = container;

      // Sync content
      globalTooltip.innerHTML = localTooltip.innerHTML;

      // Temporarily show with opacity 0 to measure dimensions
      globalTooltip.style.display = "block";
      globalTooltip.style.opacity = "0";

      const parentRect = container.getBoundingClientRect();
      const tooltipRect = globalTooltip.getBoundingClientRect();
      const direction = getEffectiveDocumentDirection();
      const viewportInlineSize = getViewportInlineSize();

      // Position calculation
      const top = window.scrollY + parentRect.bottom + 6;
      const parentInlineCenter = getRectInlineStart(parentRect, direction, viewportInlineSize) + parentRect.width / 2;
      let tooltipInlineStart = parentInlineCenter - tooltipRect.width / 2;

      // Screen boundary checks
      const padding = 10;
      if (tooltipInlineStart < padding) {
        tooltipInlineStart = padding;
      }
      if (tooltipInlineStart + tooltipRect.width > viewportInlineSize - padding) {
        tooltipInlineStart = viewportInlineSize - tooltipRect.width - padding;
      }

      const tooltipInlineGeometry: InlineGeometry = {
        inlineStart: tooltipInlineStart,
        inlineSize: tooltipRect.width,
      };
      const tooltipPhysicalLeft = getPhysicalLeftFromInlineStart(tooltipInlineGeometry, direction, viewportInlineSize);

      globalTooltip.style.top = `${top}px`;
      globalTooltip.style.left = `${window.scrollX + tooltipPhysicalLeft}px`;

      // Force reflow and animate opacity
      void globalTooltip.offsetWidth;
      globalTooltip.style.opacity = "1";

      // Set arrow pointer position dynamically
      const arrowInlineStart = parentInlineCenter - tooltipInlineStart;
      const arrowPhysicalLeft = direction === "rtl" ? tooltipRect.width - arrowInlineStart : arrowInlineStart;
      globalTooltip.style.setProperty("--arrow-left", `${arrowPhysicalLeft}px`);

      const hideAndCleanup = () => {
        if (globalTooltip) {
          globalTooltip.style.display = "none";
          globalTooltip.style.opacity = "0";
        }
        container.removeEventListener("mouseleave", hideAndCleanup);
        window.removeEventListener("scroll", hideAndCleanup, true);
        if (activeContainer === container) {
          activeContainer = null;
          cleanupActiveTooltip = null;
        }
      };

      cleanupActiveTooltip = hideAndCleanup;
      container.addEventListener("mouseleave", hideAndCleanup);
      window.addEventListener("scroll", hideAndCleanup, true);
    },
    true,
  );
}
