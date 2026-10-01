import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProductIdentifier,
  parseSupportedQr,
  upcaToEan13
} from "../public/barcode-utils.js";

test("T07: validates EAN-13, EAN-8 and UPC-A check digits", () => {
  assert.equal(normalizeProductIdentifier("4006381333931", "ean_13").valid, true);
  assert.equal(normalizeProductIdentifier("96385074", "ean_8").valid, true);
  assert.equal(normalizeProductIdentifier("036000291452", "upc_a").valid, true);
  assert.equal(normalizeProductIdentifier("4006381333932", "ean_13").valid, false);
  assert.equal(normalizeProductIdentifier("036000291453", "upc_a").valid, false);
});

test("T07: handles UPC-A and leading-zero EAN-13 equivalence explicitly", () => {
  const upc = normalizeProductIdentifier("036000291452", "upc_a");
  const ean = normalizeProductIdentifier("0036000291452", "ean_13");
  assert.equal(upcaToEan13("036000291452"), "0036000291452");
  assert.equal(upc.lookupCode, "0036000291452");
  assert.equal(ean.lookupCode, "0036000291452");
  assert.deepEqual(upc.equivalents, ["036000291452", "0036000291452"]);
});

test("T07: accepts UPC-E only with its valid expanded UPC-A checksum", () => {
  const valid = normalizeProductIdentifier("04252614", "upc_e");
  assert.equal(valid.valid, true);
  assert.equal(valid.lookupCode, "0042100005264");
  assert.equal(normalizeProductIdentifier("04252614").lookupCode, "0042100005264");
  assert.equal(normalizeProductIdentifier("04252615", "upc_e").valid, false);
});

test("T07: QR accepts only a product code or a supported GS1 identifier", () => {
  assert.equal(parseSupportedQr("4006381333931").lookupCode, "4006381333931");
  assert.equal(parseSupportedQr("https://id.gs1.org/01/09506000134352").lookupCode, "09506000134352");
  assert.equal(parseSupportedQr("0109506000134352").lookupCode, "09506000134352");
  assert.equal(parseSupportedQr("https://example.test/product/4006381333931"), null);
  assert.equal(parseSupportedQr("Order 4006381333931 ready"), null);
  assert.equal(parseSupportedQr("https://example.test"), null);
});

test("T07: arbitrary long numbers and unsupported lengths are rejected", () => {
  assert.equal(normalizeProductIdentifier("Order 4006381333931 ready").valid, false);
  assert.equal(normalizeProductIdentifier("1234567890").valid, false);
  assert.equal(normalizeProductIdentifier("12345678901234").valid, false);
});
