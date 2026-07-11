import { describe, it, expect } from "vitest";
import { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DomainId, DOMAIN_LABELS } from "@/engine/types";
import { getDomain } from "@/domains/registry";
import { inferItemIdFromTemplateId } from "@/lib/mastery";

const ALL_DOMAINS = Object.keys(DOMAIN_LABELS) as DomainId[];

describe("domain registry", () => {
  it("resolves a module for every DomainId", () => {
    expect(ALL_DOMAINS).toHaveLength(5);
    for (const id of ALL_DOMAINS) {
      const dom = getDomain(id);
      expect(dom).toBeDefined();
      expect(dom.id).toBe(id);
    }
  });

  for (const id of ALL_DOMAINS) {
    describe(id, () => {
      const dom = getDomain(id);

      it("builds a usable trial set", () => {
        const trials = dom.buildTrials("K");
        expect(trials.length).toBeGreaterThan(0);
        const templateIds = trials.map((t) => t.id);
        expect(new Set(templateIds).size).toBe(trials.length);
        for (const t of trials) {
          expect(t.choiceIds).toContain(t.correctChoiceId);
          expect(t.prompt.length).toBeGreaterThan(0);
          for (const c of t.choiceIds) {
            expect(dom.isValidChoiceId(c)).toBe(true);
          }
        }
      });

      it("exposes labeled items to the AI generator", () => {
        const items = dom.availableForAI();
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.label.length).toBeGreaterThan(0);
          expect(dom.isValidChoiceId(item.id)).toBe(true);
        }
      });

      it("renders and aria-labels every item", () => {
        for (const item of dom.availableForAI()) {
          const node = dom.renderChoice(item.id, { dyslexicFont: false });
          expect(node).toBeTruthy();
          // Actually execute the tile component (incl. the SVG math) —
          // a broken renderer would return empty markup or NaN coords.
          const markup = renderToStaticMarkup(node as ReactElement);
          expect(markup.length).toBeGreaterThan(0);
          expect(markup).not.toContain("NaN");
          expect(dom.ariaLabel(item.id).length).toBeGreaterThan(0);
        }
      });

      it("renders nothing for an unknown choice id", () => {
        const node = dom.renderChoice("not-a-real-id", { dyslexicFont: false });
        expect(renderToStaticMarkup(node as ReactElement)).toBe("");
      });

      it("rejects junk choice ids", () => {
        expect(dom.isValidChoiceId("not-a-real-id")).toBe(false);
      });

      it("template ids round-trip through item inference", () => {
        // The mastery heatmap and the AI context builder both rely on
        // recovering the item id from the templateId prefix conventions.
        for (const t of dom.buildTrials("K")) {
          const itemId = inferItemIdFromTemplateId(t.id);
          expect(itemId).toBe(t.correctChoiceId);
        }
      });
    });
  }
});
