"use client";

import type { ReactNode } from "react";
import type { BuiltOnSource } from "@/components/BuiltOn";
import { ReviewCompany, ReviewStatement, ReviewUpdate } from "@/components/ReviewCard";
import { StatusTag } from "@/components/StatusTag";
import { Text } from "@/components/Text";
import type { Card } from "./decisions";
import { titleNote } from "../record/roles/words";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// A card's sources as BuiltOn shows them: "Ironbridge story · written Sep 8", a fact with where it is.
export function builtOn(card: Card): BuiltOnSource[] {
  return card.sources.map((s) => ({ kind: s.kind, text: s.text, source: s.at ? `${s.from} · written ${day.format(s.at)}` : s.from, approved: s.approved }));
}

// Words in a row of quiet chips: titles, industries, a stack.
function Chips({ label, items }: { label?: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-label leading-label text-muted">{label}</span>}
      <ul className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li key={i} className="rounded-sm bg-subtle px-2.5 py-1 text-body-sm leading-body-sm text-text">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Two sides of a question or pair, each with what it says.
function Sides({ sides }: { sides: [label: string, text: ReactNode][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {sides.map(([label, text]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-label leading-label text-muted">{label}</span>
          <span className="text-body-md leading-body-md text-text">{text}</span>
        </div>
      ))}
    </div>
  );
}

// What the card proposes, by type.
export function CardBody({ card }: { card: Card }) {
  switch (card.type) {
    case "direction":
      return (
        <>
          <ReviewStatement>{card.into ? `${card.name}, as part of ${card.into.name}` : card.name}</ReviewStatement>
          {card.summary && <Text>{card.summary}</Text>}
          <Chips label="Includes" items={card.includes} />
        </>
      );
    case "limit":
      return (
        <>
          <ReviewStatement>{card.value}</ReviewStatement>
          {(!card.firm || card.clash) && (
            <div className="flex flex-wrap items-center gap-2">
              {!card.firm && <StatusTag tone="neutral">Preference</StatusTag>}
              {card.clash && <StatusTag tone="caution">Another limit covers this</StatusTag>}
            </div>
          )}
        </>
      );
    case "criteria":
      return (
        <>
          <ReviewStatement>{`Target titles for ${card.name}`}</ReviewStatement>
          <Chips items={card.criteria.titles} />
          <Chips label="Industries" items={card.criteria.industries} />
          <Chips label="Company sizes" items={card.criteria.sizes} />
          <Chips label="Stages" items={card.criteria.stages} />
          <Chips label="Keywords" items={card.criteria.keywords} />
          <Chips label="Companies like" items={card.criteria.seeds} />
        </>
      );
    case "positioning":
      return (
        <>
          <ReviewStatement>{card.positioning}</ReviewStatement>
          <Chips label="Target titles" items={card.targetTitles} />
          <Chips label="Words to use" items={card.vocabulary} />
        </>
      );
    case "company":
      return (
        <>
          <ReviewCompany name={card.name} line={card.line || undefined} fit={card.fit ?? undefined} />
          {card.about && card.about !== card.line && <Text size="sm">{card.about}</Text>}
          {card.openRoles !== null && (
            <Text size="sm" muted>
              {card.openRoles} open {card.openRoles === 1 ? "role" : "roles"}
            </Text>
          )}
        </>
      );
    case "role": {
      const note = titleNote({ title: card.roleTitle, alternateTitles: card.alternateTitles, employer: card.employer, break: card.break });
      return (
        <>
          <ReviewStatement>{card.title}</ReviewStatement>
          {card.line && <Text muted>{card.line}</Text>}
          {note && <p className="border-l-2 border-caution pl-3.5 text-body-sm leading-body-sm text-text">{note}</p>}
        </>
      );
    }
    case "project":
      return (
        <>
          <ReviewStatement>{card.title}</ReviewStatement>
          {card.summary && <Text>{card.summary}</Text>}
          <Chips label="Stack" items={card.stack} />
        </>
      );
    case "fact":
      return (
        <>
          <ReviewStatement>{card.text}</ReviewStatement>
          {card.orphan && (
            <div className="flex flex-col gap-1 border-l-2 border-caution pl-3.5">
              <span className="text-body-sm leading-body-sm font-semibold text-caution-text">{card.orphan.sourceDeleted ? "Its story was deleted" : "Your story no longer says this"}</span>
              <span className="text-body-sm leading-body-sm text-text">{card.orphan.sourceDeleted ?? card.orphan.noLongerSaid}</span>
            </div>
          )}
        </>
      );
    case "rewrite":
      return (
        <>
          <ReviewUpdate now={card.now} proposed={card.proposed} />
          {card.asked && (
            <Text size="sm" muted>
              You asked: {card.asked}
            </Text>
          )}
        </>
      );
    case "conflict":
      return (
        <>
          <ReviewStatement>{card.question}</ReviewStatement>
          <Sides
            sides={
              card.overlap
                ? [
                    [card.overlap.ends.employer, card.recordSays],
                    [card.overlap.starts.employer, card.narrativeSays],
                  ]
                : [
                    ["Your record says", card.recordSays],
                    ["Your story says", card.narrativeSays],
                  ]
            }
          />
        </>
      );
    case "followup":
      return (
        <>
          <ReviewStatement>{card.question}</ReviewStatement>
          {card.why && <Text muted>{card.why}</Text>}
        </>
      );
    case "insight":
      return <ReviewStatement>{card.text}</ReviewStatement>;
    case "skill":
      return (
        <>
          <ReviewStatement>{card.name}</ReviewStatement>
          {card.group && (
            <Text size="sm" muted>
              {card.group}
            </Text>
          )}
          {card.lowValue && (
            <div className="flex flex-col gap-1 border-l-2 border-caution pl-3.5">
              <span className="text-body-sm leading-body-sm font-semibold text-caution-text">Low value</span>
              <span className="text-body-sm leading-body-sm text-text">{card.lowValue}</span>
            </div>
          )}
        </>
      );
    case "skillPair":
      return (
        <>
          <ReviewStatement>{`${card.name} and ${card.otherName}`}</ReviewStatement>
          <Text muted>These look like the same thing. Keep one name, or keep both.</Text>
        </>
      );
    case "duplicate":
      return (
        <Sides
          sides={[
            ["This wording", card.text],
            ["The other", card.otherText],
          ]}
        />
      );
    case "sameWork":
      return (
        <Sides
          sides={[
            [card.project, card.text],
            [card.role, card.otherText],
          ]}
        />
      );
    case "resume":
      return (
        <>
          <ReviewStatement>{`A new version of your ${card.name}`}</ReviewStatement>
          {card.summary && <Text>{card.summary}</Text>}
          {card.preview && (
            <pre className="max-h-72 overflow-y-auto rounded-sm border bg-subtle p-3 font-sans text-body-sm leading-body-sm whitespace-pre-wrap text-text">{card.preview}</pre>
          )}
        </>
      );
  }
}
