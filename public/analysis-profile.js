// Shared by the form and server; no diagnosis or persistence is performed here.
export function normalizeAnalysisProfile(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fields = ["skinType", "context", "concerns", "goals", "applicationArea", "allergyStatus", "allergens", "previousReaction"];
  const invalidFields = Array.isArray(input.invalidFields) ? input.invalidFields.filter((x) => fields.includes(x)) : [];
  const text = (field) => {
    if (input[field] == null || input[field] === "") return "";
    if (typeof input[field] !== "string" || input[field].length > 2000) {
      invalidFields.push(field);
      return "";
    }
    return input[field].trim();
  };
  const choice = (field, choices) => {
    const raw = text(field);
    const v = field === "skinType" ? ({ dry: "сухая", oily: "жирная", combination: "комбинированная", sensitive: "чувствительная", normal: "нормальная" }[raw] || raw) : raw;
    if (!v || v === "unknown") return "";
    if (choices.includes(v)) return v;
    invalidFields.push(field);
    return "";
  };
  const array = (field) => {
    const v = input[field];
    if (v == null || v === "") return [];
    const values = typeof v === "string" ? v.split(/,(?!\d)|(?<!\d),|[;\n]/) : v;
    if (!Array.isArray(values) || values.length > 100 || values.some((x) => typeof x !== "string" || x.length > 200)) {
      invalidFields.push(field);
      return [];
    }
    return [...new Set(values.map((x) => x.trim()).filter(Boolean))];
  };
  const profile = {
    skinType: choice("skinType", ["чувствительная", "сухая", "жирная", "комбинированная", "нормальная"]),
    context: choice("context", ["после процедуры", "домашний уход", "перед покупкой", "назначил косметолог"]),
    concerns: text("concerns"),
    goals: array("goals"),
    applicationArea: choice("applicationArea", ["face", "body", "hair_or_scalp", "lips", "eye_area"]),
    allergyStatus: choice("allergyStatus", ["none_reported", "reported"]),
    allergens: array("allergens"),
    previousReaction: choice("previousReaction", ["none_reported", "this_product", "other_product"])
  };
  if (profile.goals.some((x) => !["hydration", "barrier", "appearance", "cleansing"].includes(x))) {
    invalidFields.push("goals");
    profile.goals = [];
  }
  if (profile.allergens.length) profile.allergyStatus = "reported";
  if (invalidFields.length) profile.invalidFields = [...new Set(invalidFields)];
  return profile;
}

export function hasPersonalProfile(value) {
  const profile = normalizeAnalysisProfile(value);
  return Object.values(profile).some((x) => Array.isArray(x) ? x.length > 0 : Boolean(x))
    || Boolean(value?.invalidFields?.length);
}

export function isSessionOnlyHistory(entry) {
  const payload = entry?.payload || entry || {};
  const analysis = payload.analysis || {};
  return hasPersonalProfile(payload.profile)
    || hasPersonalProfile(analysis.analysisContract?.profile)
    || hasPersonalProfile(analysis.personalization?.profile)
    || analysis.personalization?.profileProvided === true
    || analysis.historyPolicy?.mode === "session_only";
}
