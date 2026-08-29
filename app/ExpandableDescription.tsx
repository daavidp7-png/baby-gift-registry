"use client";

import { useLayoutEffect, useRef, useState } from "react";

export default function ExpandableDescription({
  description,
  seeMoreLabel,
  seeLessLabel,
}: {
  description: string;
  seeMoreLabel: string;
  seeLessLabel: string;
}) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const naturalDescriptionRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const descriptionElement = descriptionRef.current;
    const naturalDescriptionElement = naturalDescriptionRef.current;
    if (!descriptionElement || !naturalDescriptionElement) return;

    const measureOverflow = () => {
      const lineHeight = Number.parseFloat(
        window.getComputedStyle(descriptionElement).lineHeight
      );
      const collapsedHeight = Number.isFinite(lineHeight)
        ? lineHeight * 3
        : descriptionElement.clientHeight;

      setOverflows(
        naturalDescriptionElement.scrollHeight > collapsedHeight + 1
      );
    };

    measureOverflow();
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(descriptionElement);
    resizeObserver.observe(naturalDescriptionElement);

    void document.fonts?.ready.then(measureOverflow);

    return () => resizeObserver.disconnect();
  }, [description]);

  return (
    <div className="relative mb-4">
      <p
        ref={descriptionRef}
        className={`text-sm leading-5 text-[#756b67] ${
          expanded ? "" : "gift-description-clamped"
        }`}
      >
        {description}
      </p>

      <p
        ref={naturalDescriptionRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 text-sm leading-5 text-[#756b67]"
      >
        {description}
      </p>

      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1.5 min-h-8 touch-manipulation text-sm font-medium text-[#756b67] underline decoration-[#c8b9b2] underline-offset-4 transition-colors hover:text-[#302b29]"
        >
          {expanded ? seeLessLabel : seeMoreLabel}
        </button>
      )}
    </div>
  );
}
