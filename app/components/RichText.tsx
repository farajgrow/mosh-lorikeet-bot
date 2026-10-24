import { Fragment } from "react";

/** Minimal markdown: **bold**, line breaks and "- " bullet lines. */
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-•]\s+/, "") : line;
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-semibold">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <Fragment key={j}>{p}</Fragment>
          ),
        );
        if (bullet)
          return (
            <span key={i} className="flex gap-2 pl-1">
              <span aria-hidden>•</span>
              <span>{parts}</span>
            </span>
          );
        return (
          <Fragment key={i}>
            {parts}
            {i < lines.length - 1 && <br />}
          </Fragment>
        );
      })}
    </>
  );
}
