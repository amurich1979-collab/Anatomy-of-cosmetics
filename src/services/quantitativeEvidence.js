import { createHash } from "node:crypto";

export const QUANTITATIVE_EVIDENCE_VERSION = "1.0.0";

const BASIS_STATUSES = new Set(["manufacturer_declared", "user_reported", "test_reported", "unknown"]);
const MANUFACTURER_SOURCE_TYPES = new Set(["official_brand_page", "package_label", "manufacturer_document"]);
const TEST_SOURCE_TYPES = new Set(["finished_product_test", "laboratory_report", "official_test_report"]);
const PRODUCT_PROPERTIES = new Set(["pH", "SPF", "UVA-PF", "critical_wavelength", "water_resistance"]);
const PHOTOPROTECTION_PROPERTIES = new Set(["SPF", "UVA-PF", "critical_wavelength", "water_resistance"]);
const NUMERIC_PROPERTIES = new Set([
  "concentration", "pH", "SPF", "UVA-PF", "critical_wavelength",
  "water_resistance", "effect_duration", "reapplication_interval"
]);
const PROPERTY_ALIASES = new Map([
  ["concentration", "concentration"],
  ["percentage", "concentration"],
  ["ph", "pH"],
  ["spf", "SPF"],
  ["uva-pf", "UVA-PF"],
  ["uvapf", "UVA-PF"],
  ["critical-wavelength", "critical_wavelength"],
  ["water-resistance", "water_resistance"],
  ["filter-spectrum", "filter_spectrum"],
  ["effect-duration", "effect_duration"],
  ["reapplication-interval", "reapplication_interval"]
]);

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const key = (value) => text(value).toLowerCase().replace(/[\s_]+/g, "-").replace(/[\u2010-\u2015]/g, "-");
const shortHash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

function cloneRecord(value) {
  const source = safeObject(value);
  return Object.fromEntries(Object.entries(source)
    .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item) || item === null)
    .map(([name, item]) => [name, item]));
}

function normalizeProperty(value) {
  return PROPERTY_ALIASES.get(key(value)) || null;
}

function normalizeValue(input, property) {
  if (typeof input === "number") return { kind: "exact", exact: finiteNumber(input), label: String(input) };
  if (typeof input === "string") {
    const normalized = text(input).replace(",", ".");
    const lowerBound = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*\+$/);
    if (lowerBound) return { kind: "lower_bound", min: Number(lowerBound[1]), label: text(input) };
    const exact = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(%)?$/);
    if (exact?.[2] && property !== "concentration") return null;
    if (exact) return { kind: "exact", exact: Number(exact[1]), label: text(input) };
    return null;
  }
  const value = safeObject(input);
  const kindValue = key(value.kind);
  if (kindValue === "exact") {
    const exact = finiteNumber(value.exact ?? value.value);
    return exact == null ? null : { kind: "exact", exact, label: text(value.label) || String(exact) };
  }
  if (kindValue === "range") {
    const min = finiteNumber(value.min);
    const max = finiteNumber(value.max);
    return min == null || max == null || min > max ? null : { kind: "range", min, max, label: text(value.label) || `${min}-${max}` };
  }
  if (kindValue === "lower-bound" || kindValue === "lower_bound") {
    const min = finiteNumber(value.min ?? value.value);
    return min == null ? null : { kind: "lower_bound", min, label: text(value.label) || `${min}+` };
  }
  return null;
}

function bounds(value) {
  if (!value) return [];
  if (value.kind === "exact") return [value.exact];
  if (value.kind === "range") return [value.min, value.max];
  if (value.kind === "lower_bound") return [value.min];
  return [];
}

function validValue(property, value) {
  const numbers = bounds(value);
  if (!numbers.length || numbers.some((item) => !Number.isFinite(item))) return false;
  if (property === "concentration") return numbers.every((item) => item >= 0 && item <= 100);
  if (property === "pH") return numbers.every((item) => item >= 0 && item <= 14);
  if (["SPF", "UVA-PF", "effect_duration", "reapplication_interval"].includes(property)) return numbers.every((item) => item > 0);
  if (property === "critical_wavelength") return numbers.every((item) => item >= 250 && item <= 500);
  if (property === "water_resistance") return numbers.every((item) => item > 0 && item <= 1440);
  return false;
}

function expectedUnit(property, supplied) {
  const unit = text(supplied);
  if (property === "concentration") return unit === "%" || !unit ? "%" : null;
  if (property === "pH") return !unit || key(unit) === "ph" ? "pH" : null;
  if (property === "SPF") return !unit || key(unit) === "spf" ? "SPF" : null;
  if (property === "UVA-PF") return !unit || ["uva-pf", "uvapf"].includes(key(unit)) ? "UVA-PF" : null;
  if (property === "critical_wavelength") return !unit || ["nm", "нм"].includes(key(unit)) ? "nm" : null;
  if (property === "water_resistance") return ["min", "minute", "minutes", "мин", "минуты"].includes(key(unit)) ? "minutes" : null;
  if (["effect_duration", "reapplication_interval"].includes(property)) {
    const allowed = new Map([
      ["min", "minutes"], ["minute", "minutes"], ["minutes", "minutes"], ["мин", "minutes"],
      ["hour", "hours"], ["hours", "hours"], ["h", "hours"], ["час", "hours"], ["ч", "hours"],
      ["day", "days"], ["days", "days"], ["день", "days"], ["дней", "days"],
      ["week", "weeks"], ["weeks", "weeks"], ["неделя", "weeks"], ["недель", "weeks"]
    ]);
    return allowed.get(key(unit)) || null;
  }
  return null;
}

function resolveSubject(input, assessment) {
  const subject = safeObject(input);
  const kindValue = key(subject.kind).replace(/-/g, "_");
  const formulaId = text(assessment.formulaRef?.formulaId);
  if (kindValue === "finished_product") {
    if (!formulaId) return { error: "missing_formula_id" };
    if (text(subject.id) && text(subject.id) !== formulaId) return { error: "subject_formula_mismatch" };
    return { value: { kind: "finished_product", id: formulaId, name: text(subject.name) || null } };
  }
  if (!["ingredient", "trade_mixture"].includes(kindValue)) return { error: "invalid_subject_kind" };
  const lookup = key(subject.name || subject.id);
  if (!lookup) return { error: "missing_subject_name" };
  const item = (assessment.ingredients || []).find((entry) => [entry.id, entry.canonicalName, entry.input].some((candidate) => key(candidate) === lookup));
  if (!item) return { error: "unresolved_subject" };
  const expectedKind = item.identityKind === "proprietary_complex" ? "trade_mixture" : "ingredient";
  if (kindValue !== expectedKind || item.identityStatus !== "confirmed" && expectedKind === "ingredient") return { error: "subject_kind_mismatch" };
  return { value: { kind: kindValue, id: item.id, name: item.canonicalName || item.input } };
}

function sourceRecord(input, measurement, basisStatus) {
  const source = safeObject(input);
  const sourceType = key(source.type).replace(/-/g, "_");
  const title = text(source.name || source.title);
  const locator = text(measurement.locator || source.locator);
  if (!sourceType || !title || !locator) return null;
  const fingerprint = [sourceType, title, text(source.url), locator, text(source.retrievedAt), text(measurement.formulaId)].join("|");
  return {
    id: `source:quantitative:${shortHash(fingerprint)}`,
    type: sourceType,
    url: text(source.url) || null,
    artifactRef: text(source.artifactRef) || null,
    title,
    locator,
    checkedAt: basisStatus === "user_reported" ? null : text(source.checkedAt) || null,
    retrievedAt: text(source.retrievedAt) || null,
    publishedAt: text(source.publishedAt) || null,
    jurisdiction: text(source.jurisdiction) || null,
    productVersion: text(source.productVersion || measurement.formulaVersion) || null,
    checkedScope: basisStatus === "test_reported" ? "finished_product_test_metric" : basisStatus === "manufacturer_declared" ? "manufacturer_product_claim" : "user_supplied_measurement",
    contentHash: text(source.contentHash) || null,
    review: null
  };
}

function resolvedBasisStatus(requested, sourceType, evidenceTrust) {
  const claimed = BASIS_STATUSES.has(requested) ? requested : "unknown";
  if (evidenceTrust !== "server_verified") return { basisStatus: "user_reported", claimedBasisStatus: claimed, downgraded: claimed !== "user_reported" };
  if (claimed === "test_reported" && TEST_SOURCE_TYPES.has(sourceType)) return { basisStatus: claimed, claimedBasisStatus: claimed, downgraded: false };
  if (claimed === "manufacturer_declared" && MANUFACTURER_SOURCE_TYPES.has(sourceType)) return { basisStatus: claimed, claimedBasisStatus: claimed, downgraded: false };
  if (claimed === "user_reported") return { basisStatus: claimed, claimedBasisStatus: claimed, downgraded: false };
  return { basisStatus: "user_reported", claimedBasisStatus: claimed, downgraded: claimed !== "user_reported" };
}

function formulaMatches(measurement, assessment) {
  const formulaId = text(assessment.formulaRef?.formulaId);
  if (!formulaId || text(measurement.formulaId) !== formulaId) return false;
  const currentVersion = text(assessment.formulaRef?.version);
  const measurementVersion = text(measurement.formulaVersion);
  if (currentVersion && measurementVersion !== currentVersion) return false;
  return !measurementVersion || !currentVersion || measurementVersion === currentVersion;
}

function valueText(value, unit) {
  if (value.kind === "exact") return `${value.exact}${unit === "%" ? "%" : ` ${unit}`}`;
  if (value.kind === "range") return `${value.min}-${value.max}${unit === "%" ? "%" : ` ${unit}`}`;
  return `не ниже ${value.min}${unit === "%" ? "%" : ` ${unit}`}`;
}

function measurementClaim({ id, subject, property, value, unit, basisStatus, sourceId, locator, conditions }) {
  const metric = property === "concentration" ? "концентрацию" : property;
  const rendered = valueText(value, unit);
  const subjectName = subject.name || "готового продукта";
  let claimText = `Пользователь сообщил ${metric} ${rendered} для «${subjectName}»; источник не проверен сервисом.`;
  let kind = "user_report";
  let verification = "unverified";
  if (basisStatus === "manufacturer_declared") {
    claimText = `Производитель заявляет ${metric} ${rendered} для «${subjectName}». Это заявление производителя, а не независимо подтверждённый этим сервисом результат испытания.`;
    kind = "manufacturer_claim";
    verification = "source_checked";
  } else if (basisStatus === "test_reported") {
    claimText = `В указанном протоколе испытания готового продукта приведён показатель ${metric}: ${rendered}.`;
    kind = "finished_product_test";
    verification = "source_checked";
  }
  return {
    id: `claim:${id}`, subject: subject.kind === "finished_product" ? "product" : subject.id,
    kind, text: claimText, verification,
    basis: [{ sourceId, locator, ruleId: "C10.explicit-measurement", ruleVersion: QUANTITATIVE_EVIDENCE_VERSION, inputRefs: [subject.id] }],
    scope: conditions, limitations: basisStatus === "manufacturer_declared" ? ["Не является независимой проверкой сервиса."] : [],
    missingInputs: [], review: null
  };
}

function normalizeSpectrum(value) {
  const entries = Array.isArray(value) ? value : [value];
  const result = [];
  for (const item of entries) {
    const normalized = key(item).replace(/-/g, "_");
    if (["uva", "uvb"].includes(normalized)) result.push(normalized.toUpperCase());
    if (["uva_uvb", "broad_spectrum"].includes(normalized)) result.push("UVA", "UVB");
  }
  return [...new Set(result)].sort();
}

function addUnique(collection, item) {
  if (!collection.some((existing) => existing.id === item.id)) collection.push(item);
}

function rejection(index, measurement, reason) {
  return { index, property: normalizeProperty(measurement?.property) || text(measurement?.property) || null, reason };
}

export function applyQuantitativeEvidence({ assessment, measurements = [], evidenceTrust = "client" } = {}) {
  const result = structuredClone(assessment);
  const input = Array.isArray(measurements) ? measurements : [];
  const diagnostics = { received: input.length, accepted: 0, downgraded: 0, rejected: [] };
  result.quantitative = Array.isArray(result.quantitative) ? result.quantitative : [];
  result.photoprotection = result.photoprotection || { filters: [], productMetrics: [], instructionClaimIds: [], unknownClaimIds: [] };
  result.duration = Array.isArray(result.duration) ? result.duration : [];
  result.claims = Array.isArray(result.claims) ? result.claims : [];
  result.sources = Array.isArray(result.sources) ? result.sources : [];

  input.forEach((rawMeasurement, index) => {
    const measurement = safeObject(rawMeasurement);
    const property = normalizeProperty(measurement.property);
    if (!property) return diagnostics.rejected.push(rejection(index, measurement, "unsupported_property"));
    if (!formulaMatches(measurement, result)) return diagnostics.rejected.push(rejection(index, measurement, "formula_identity_or_version_mismatch"));
    const resolvedSubject = resolveSubject(measurement.subject, result);
    if (resolvedSubject.error) return diagnostics.rejected.push(rejection(index, measurement, resolvedSubject.error));
    const subject = resolvedSubject.value;
    if (PRODUCT_PROPERTIES.has(property) && subject.kind !== "finished_product") return diagnostics.rejected.push(rejection(index, measurement, "finished_product_metric_requires_finished_product_subject"));
    if (property === "concentration" && !["ingredient", "trade_mixture"].includes(subject.kind)) return diagnostics.rejected.push(rejection(index, measurement, "concentration_requires_ingredient_or_trade_mixture"));
    if (["effect_duration", "reapplication_interval"].includes(property) && subject.kind !== "finished_product") return diagnostics.rejected.push(rejection(index, measurement, "duration_requires_finished_product_subject"));
    if (property === "filter_spectrum" && subject.kind !== "ingredient") return diagnostics.rejected.push(rejection(index, measurement, "filter_spectrum_requires_ingredient_subject"));

    const requestedBasis = BASIS_STATUSES.has(measurement.basisStatus) ? measurement.basisStatus : "unknown";
    const sourceType = key(measurement.source?.type).replace(/-/g, "_");
    const basis = resolvedBasisStatus(requestedBasis, sourceType, evidenceTrust);
    const source = sourceRecord(measurement.source, measurement, basis.basisStatus);
    if (!source) return diagnostics.rejected.push(rejection(index, measurement, "source_and_locator_are_required"));
    if (basis.downgraded) diagnostics.downgraded += 1;
    const conditions = cloneRecord(measurement.conditions);

    if (property === "filter_spectrum") {
      const spectrum = normalizeSpectrum(measurement.value);
      if (!spectrum.length) return diagnostics.rejected.push(rejection(index, measurement, "invalid_filter_spectrum"));
      const filter = result.photoprotection.filters.find((item) => item.ingredientRef === subject.id);
      if (!filter) return diagnostics.rejected.push(rejection(index, measurement, "ingredient_is_not_identified_as_uv_filter"));
      addUnique(result.sources, source);
      const id = `filter-spectrum:${shortHash(`${subject.id}|${spectrum.join("+")}|${source.id}`)}`;
      const claim = {
        id: `claim:${id}`, subject: subject.id, kind: basis.basisStatus === "user_reported" ? "user_report" : "source_fact",
        text: `${basis.basisStatus === "user_reported" ? "Пользователь сообщил" : "Источник указывает"} спектр отдельного фильтра «${subject.name}»: ${spectrum.join(" и ")}. Это не показатель SPF или UVA-PF готового продукта.`,
        verification: basis.basisStatus === "user_reported" ? "unverified" : "source_checked",
        basis: [{ sourceId: source.id, locator: source.locator, ruleId: "C10.filter-spectrum", ruleVersion: QUANTITATIVE_EVIDENCE_VERSION, inputRefs: [subject.id] }],
        scope: conditions, limitations: ["Спектр отдельного фильтра нельзя суммировать в SPF или UVA-PF продукта."], missingInputs: [], review: null
      };
      addUnique(result.claims, claim);
      filter.spectrumClaimIds = [...new Set([...(filter.spectrumClaimIds || []), claim.id])].sort();
      diagnostics.accepted += 1;
      return;
    }

    if (!NUMERIC_PROPERTIES.has(property)) return diagnostics.rejected.push(rejection(index, measurement, "unsupported_numeric_property"));
    const value = normalizeValue(measurement.value, property);
    const unit = expectedUnit(property, measurement.unit);
    if (!value || !unit || !validValue(property, value)) return diagnostics.rejected.push(rejection(index, measurement, "invalid_value_or_unit"));
    const effect = text(measurement.effect);
    if (property === "effect_duration" && !effect) return diagnostics.rejected.push(rejection(index, measurement, "effect_is_required"));
    addUnique(result.sources, source);
    const id = `quantitative:${shortHash(`${result.formulaRef.formulaId}|${subject.kind}|${subject.id}|${property}|${JSON.stringify(value)}|${source.id}`)}`;
    const item = {
      id, subject, property, value, unit, basisStatus: basis.basisStatus,
      claimedBasisStatus: basis.claimedBasisStatus, sourceId: source.id, locator: source.locator,
      formulaId: result.formulaRef.formulaId, formulaVersion: result.formulaRef.version || null,
      conditions, unknownReason: null
    };
    addUnique(result.quantitative, item);
    if (["ingredient", "trade_mixture"].includes(subject.kind)) {
      const ingredient = result.ingredients.find((entry) => entry.id === subject.id);
      ingredient.quantitative = [...new Set([...(ingredient.quantitative || []), id])].sort();
    }
    const claim = measurementClaim({ ...item, conditions });
    addUnique(result.claims, claim);

    if (PHOTOPROTECTION_PROPERTIES.has(property)) {
      addUnique(result.photoprotection.productMetrics, {
        id: `product-metric:${shortHash(id)}`, property, quantitativeRef: id,
        claimId: claim.id, basisStatus: item.basisStatus, sourceId: item.sourceId,
        testReported: item.basisStatus === "test_reported",
        independentlyVerified: false
      });
    }
    if (property === "effect_duration") {
      addUnique(result.duration, {
        id: `duration:${shortHash(id)}`, kind: "effect_duration", effect,
        duration: value, unit, basisStatus: item.basisStatus, sourceId: item.sourceId,
        formulaId: item.formulaId, conditions, claimId: claim.id,
        instructionClaimIds: [], doesNotEstablishEffectDuration: false
      });
    }
    if (property === "reapplication_interval") {
      const durationItem = {
        id: `duration:${shortHash(id)}`, kind: "instruction_interval", effect: "reapplication_instruction",
        duration: value, unit, basisStatus: item.basisStatus, sourceId: item.sourceId,
        formulaId: item.formulaId, conditions, claimId: claim.id,
        instructionClaimIds: [claim.id], doesNotEstablishEffectDuration: true
      };
      addUnique(result.duration, durationItem);
      result.photoprotection.instructionClaimIds = [...new Set([...(result.photoprotection.instructionClaimIds || []), claim.id])].sort();
    }
    diagnostics.accepted += 1;
  });

  result.quantitative.sort((left, right) => left.id.localeCompare(right.id));
  result.photoprotection.productMetrics.sort((left, right) => left.id.localeCompare(right.id));
  result.duration.sort((left, right) => left.id.localeCompare(right.id));
  result.claims.sort((left, right) => left.id.localeCompare(right.id));
  result.sources.sort((left, right) => left.id.localeCompare(right.id));
  result.quantitativeDiagnostics = diagnostics;
  result.versions = { ...(result.versions || {}), quantitativeEvidence: QUANTITATIVE_EVIDENCE_VERSION };
  return result;
}
