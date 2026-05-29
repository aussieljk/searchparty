import type { PageResult } from "@/types";

/**
 * A top-level tab contributed by a feature. Drop a `tab.tsx` in
 * `ui/src/features/<name>/` exporting `const tab`.
 */
export interface FeatureTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Lower sorts earlier. The built-in "Pages" tab is order 0. */
  order?: number;
  Component: () => React.JSX.Element;
}

/**
 * A section appended to the per-page detail Sheet. Drop a `detail.tsx` in
 * `ui/src/features/<name>/` exporting `const detail`.
 */
export interface FeatureDetail {
  id: string;
  order?: number;
  Component: (p: { page: PageResult }) => React.JSX.Element | null;
}

// Eagerly collect every feature's tab.tsx / detail.tsx. The glob is empty-safe:
// it simply yields no modules if no feature folder has the file.
const tabModules = import.meta.glob<{ tab?: FeatureTab }>("./*/tab.tsx", { eager: true });
const detailModules = import.meta.glob<{ detail?: FeatureDetail }>("./*/detail.tsx", {
  eager: true,
});

export const featureTabs: FeatureTab[] = Object.values(tabModules)
  .map((m) => m.tab)
  .filter((t): t is FeatureTab => !!t)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

export const featureDetails: FeatureDetail[] = Object.values(detailModules)
  .map((m) => m.detail)
  .filter((d): d is FeatureDetail => !!d)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
