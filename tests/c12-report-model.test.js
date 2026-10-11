import assert from "node:assert/strict";
import test from "node:test";

import { analyzeComposition } from "../src/analyzer.js";
import { buildAnalysisReportModel } from "../public/analysis-report.js";

function report(text, { scope = "full", confirmation = "source_declared" } = {}) {
  const analysis = analyzeComposition({
    text,
    productName: "Fixture cream",
    formulaScope: scope,
    formulaEvidence: { scope, confirmation, associationStatus: "confirmed" },
    productEvidence: {
      identificationStatus: "confirmed",
      name: "Fixture cream",
      category: "Face cream",
      source: { name: "Fixture source", type: "manufacturer_page", url: "https://example.test/product" }
    }
  });
  return { analysis, model: buildAnalysisReportModel(analysis, "Fixture cream") };
}

test("C12: report model exposes all systems from the original specification", () => {
  const { model } = report("Aqua, Glycerin, Cetearyl Alcohol, Glyceryl Stearate, Phenoxyethanol, Parfum, Niacinamide");
  assert.equal(model.systems.length, 13);
  assert.deepEqual(model.systems.map((item) => item.id), [
    "water_phase", "humectants", "emollients", "lipid_phase", "oils", "barrier_lipids",
    "emulsification", "surfactants", "rheology", "preservation", "fragrance", "actives", "uv_filters"
  ]);
  assert.equal(model.quantitative.length, 0);
  assert.equal(model.photoprotection.productMetrics.length, 0);
  assert.equal(model.duration.length, 0);
  assert.equal(model.personal.safetyEstablished, false);
  assert.equal(model.personal.applicationAdviceAllowed, false);
});

test("C12: absent in a complete INCI and unresolved in an incomplete formula stay distinct", () => {
  const complete = report("Aqua, Glycerin, Phenoxyethanol").model;
  const absentOil = complete.systems.find((item) => item.id === "oils");
  assert.equal(absentOil.status, "not_identified");
  assert.equal(absentOil.statusLabel, "Не выявлено в полном INCI");
  assert.match(absentOil.explanation, /не лабораторное доказательство/);

  const partial = report("Aqua, Unresolvedium Extract", { scope: "partial", confirmation: "unverified" }).model;
  const unresolvedOil = partial.systems.find((item) => item.id === "oils");
  assert.equal(unresolvedOil.status, "insufficient_data");
  assert.equal(unresolvedOil.statusLabel, "Не удалось определить");
  assert.match(unresolvedOil.explanation, /формула неполна/);
});

test("C12: reference functions never become confirmed product purpose", () => {
  const { analysis, model } = report("Aqua, Cetearyl Alcohol, Phenoxyethanol");
  const surfactants = model.systems.find((item) => item.id === "surfactants");
  assert.equal(surfactants.status, "reference_only");
  assert.match(surfactants.explanation, /не подтверждаются/);
  assert.equal(analysis.productSafety.purposeStatus, "confirmed_manufacturer");
  assert.notEqual(analysis.productSafety.type, "cleanser");
  assert.match(analysis.productSafety.intendedUse, /карточк|крем/i);
});

test("C12: concise result retains product, type, completeness and personal status without a second summary", () => {
  const { model } = report("Aqua, Glycerin, Phenoxyethanol");
  assert.equal(model.title, "Fixture cream");
  assert.equal(model.concise.facts.length, 4);
  assert.match(model.concise.facts[0], /^Тип:/);
  assert.match(model.concise.facts[1], /^Состав:/);
  assert.match(model.concise.facts[2], /^Совпадения:/);
  assert.match(model.concise.facts[3], /^Персональный вывод:/);
});
