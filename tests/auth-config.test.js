import test from "node:test";
import assert from "node:assert/strict";
import { getGoogleOAuthStatusForRequest } from "../src/auth.js";

function mockRequest() {
  return {
    protocol: "http",
    headers: {
      host: "localhost:3000"
    }
  };
}

test("Google auth status reports missing OAuth environment", () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousAppUrl = process.env.APP_URL;
  const previousPublicUrl = process.env.PUBLIC_URL;
  const previousRedirectUri = process.env.GOOGLE_REDIRECT_URI;

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.APP_URL;
  delete process.env.PUBLIC_URL;
  delete process.env.GOOGLE_REDIRECT_URI;

  try {
    const status = getGoogleOAuthStatusForRequest(mockRequest());
    assert.equal(status.configured, false);
    assert.deepEqual(status.missing, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL"]);
    assert.equal(status.redirectUri, "http://localhost:3000/api/auth/google/callback");
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = previousPublicUrl;
    if (previousRedirectUri === undefined) delete process.env.GOOGLE_REDIRECT_URI;
    else process.env.GOOGLE_REDIRECT_URI = previousRedirectUri;
  }
});

test("Google auth status is configured when client credentials and app URL exist", () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousAppUrl = process.env.APP_URL;

  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.APP_URL = "https://example.test/";

  try {
    const status = getGoogleOAuthStatusForRequest(mockRequest());
    assert.equal(status.configured, true);
    assert.deepEqual(status.missing, []);
    assert.equal(status.redirectUri, "https://example.test/api/auth/google/callback");
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});
