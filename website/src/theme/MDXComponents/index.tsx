import React, {useEffect, useRef, useState, type ComponentPropsWithoutRef} from 'react';
import MDXComponents from '@theme-original/MDXComponents';

/** Infima makes the table itself the scroll container. Keep its native semantics and headers,
 * while letting keyboard users reach overflowing columns without adding tab stops to tables
 * that fit. The initial tab stop also works before hydration; both server and first client render
 * agree. Observe the row groups as well as the viewport so loaded fonts can change the result. */
function ScrollableTable(props: ComponentPropsWithoutRef<'table'>) {
  const ref = useRef<HTMLTableElement>(null);
  const [scrollable, setScrollable] = useState(true);
  const [headerLabel, setHeaderLabel] = useState<string>();

  useEffect(() => {
    const table = ref.current;
    if (!table) return undefined;

    const update = () => {
      setScrollable(table.scrollWidth > table.clientWidth);
      setHeaderLabel(
        table.caption
          ? undefined
          : Array.from(table.tHead?.rows[0]?.cells ?? [])
              .map((cell) => cell.textContent?.trim())
              .filter(Boolean)
              .join('; ') || undefined,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(table);
    for (const section of table.children) observer.observe(section);
    return () => observer.disconnect();
  }, [props.children]);

  return (
    <table
      {...props}
      ref={ref}
      tabIndex={props.tabIndex ?? (scrollable ? 0 : undefined)}
      aria-label={
        props['aria-label'] ??
        (scrollable && !props['aria-labelledby'] ? headerLabel : undefined)
      }
    />
  );
}

export default {
  ...MDXComponents,
  table: ScrollableTable,
};
