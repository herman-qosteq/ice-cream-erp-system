import React from 'react';
import { ScrollView } from 'react-native';

interface ScrollableSectionProps {
  height: number;
  children: React.ReactNode;
}

// Fixed-height scroll region for a table/card list, so the container's size
// stays constant whether the current page has 1 row or 500 - 5 records
// leaves empty space below them rather than the box shrinking to fit, and
// 500 scrolls internally rather than growing it. Deliberately `height`, not
// `maxHeight`: maxHeight is only a ceiling and lets the box collapse down
// when content is short, which is exactly the "resizes with record count"
// behavior this exists to avoid. <PaginationFooter> renders as a sibling
// AFTER this (not inside it), so it stays visible without needing its own
// scroll or any CSS position:sticky trick. nestedScrollEnabled matters on
// Android specifically: this sits inside the screen's own outer page
// ScrollView, and without it Android can route scroll gestures to the wrong
// one.
export default function ScrollableSection({ height, children }: ScrollableSectionProps) {
  return (
    <ScrollView
      style={{ height }}
      contentContainerStyle={{ flexGrow: 1 }}
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  );
}
