"use client";

import { getPosDisplay, splitPosAtoms } from "../lib/vocab/pos-display.mjs";

function posKey(value) {
  return splitPosAtoms(value)
    .map((atom) => String(atom || "").trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

export default function InlineStudyMeaning({
  primaryMeaning,
  primaryPos = "",
  supplementalSenses = []
}) {
  const senses = (Array.isArray(supplementalSenses) ? supplementalSenses : [])
    .filter((sense) => String(sense?.meaning || "").trim());
  const primaryPosKey = posKey(primaryPos);

  return (
    <div className="meaning-primary">
      <span className="meaning-primary-text">{primaryMeaning}</span>
      {senses.length ? (
        <span className="meaning-inline-supplemental">
          {senses.map((sense, index) => {
            const sensePos = String(sense?.pos || "").trim();
            const showPos = Boolean(sensePos) && posKey(sensePos) !== primaryPosKey;
            return (
              <span className="meaning-inline-sense" key={`${sense.meaning}-${sensePos}-${index}`}>
                <span className="meaning-inline-separator">；</span>
                {showPos ? (
                  <span className="meaning-inline-pos">{getPosDisplay(sensePos)}</span>
                ) : null}
                <span>{sense.meaning}</span>
              </span>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}
