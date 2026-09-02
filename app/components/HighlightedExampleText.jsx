import {
  getExampleHighlightTargets,
  splitExampleForHighlight
} from "../lib/vocab/example-highlight.mjs";

export default function HighlightedExampleText({ sentence, item, forms }) {
  const targets = getExampleHighlightTargets(item, forms);
  return splitExampleForHighlight(sentence, targets).map((segment, index) => (
    segment.highlighted
      ? <strong className="example-target" key={`${segment.text}-${index}`}>{segment.text}</strong>
      : segment.text
  ));
}
