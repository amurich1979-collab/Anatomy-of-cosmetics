export const FORMULA_CONFIRMATIONS = Object.freeze({
  sourceDeclared: "source_declared",
  userConfirmed: "user_confirmed",
  unverified: "unverified",
  conflicting: "conflicting"
});

export function createFormulaOrigin(value, {
  mode = "empty",
  product = null,
  productId = product?.id || "",
  source = "",
  sourceType = "",
  sourceUrl = "",
  sourceDate = null,
  formulaScope = "unknown",
  formulaConfirmation,
  formulaVersion = null,
  market = null
} = {}) {
  if (!String(value || "").trim()) {
    return {
      mode: "empty", productId: "", source: "", sourceType: "", sourceUrl: "", sourceDate: null,
      formulaScope: "unknown", formulaConfirmation: FORMULA_CONFIRMATIONS.unverified,
      formulaVersion: null, market: null
    };
  }
  const defaultConfirmation = mode === "product"
    ? FORMULA_CONFIRMATIONS.sourceDeclared
    : FORMULA_CONFIRMATIONS.unverified;
  return {
    mode,
    productId: String(productId || ""),
    source: source || product?.source || "",
    sourceType: sourceType || product?.sourceType || mode,
    sourceUrl: sourceUrl || "",
    sourceDate,
    formulaScope: formulaScope || "unknown",
    formulaConfirmation: formulaConfirmation || defaultConfirmation,
    formulaVersion,
    market
  };
}

export function confirmFullLabelFormula(origin, productId = "") {
  return {
    ...origin,
    productId: String(productId || origin?.productId || ""),
    formulaScope: "full",
    formulaConfirmation: FORMULA_CONFIRMATIONS.userConfirmed
  };
}

export function unconfirmFullLabelFormula(origin) {
  if (origin?.formulaConfirmation !== FORMULA_CONFIRMATIONS.userConfirmed) return origin;
  return { ...origin, formulaScope: "unknown", formulaConfirmation: FORMULA_CONFIRMATIONS.unverified };
}

export function detachFormulaFromProduct(origin) {
  if (!origin || origin.mode === "empty" || origin.mode === "product") return origin;
  return {
    ...unconfirmFullLabelFormula(origin),
    productId: ""
  };
}

export function formulaAssociationStatus(origin, product) {
  const formulaProductId = String(origin?.productId || "");
  const selectedProductId = String(product?.id || "");
  if (!formulaProductId || !selectedProductId) return "unknown";
  return formulaProductId === selectedProductId ? "confirmed" : "unconfirmed";
}

export function isAsyncRevisionCurrent(startRevision, currentRevision) {
  return startRevision === currentRevision;
}
