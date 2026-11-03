// The MM monogram, traced from mm_logo.png at the repo root.
// Paints in currentColor, so its colour comes from the surrounding text.
export default function Monogram({ size = 32, className }) {
  return (
    <svg className={className} viewBox="680 370 650 670" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M712 384 L1003 672 L1294 384 Q1316 420 1293 458 L1003 748 L713 458 Q690 420 712 384 Z" />
      <path d="M712 558 L1003 842 L1187 662 Q1210 700 1187 738 L1003 922 L713 632 Q690 595 712 558 Z" />
      <path d="M698 700 L736 738 Q756 758 756 780 L756 1030 Q698 1030 698 972 Z" />
      <path d="M1308 542 L1308 972 Q1308 1030 1251 1030 L1251 622 Q1251 600 1268 582 Z" />
    </svg>
  );
}
