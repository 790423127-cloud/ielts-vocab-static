import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocalRequest,
  requireLocalAdmin,
  requireLocalRead,
  buildSpeechRequestHeaders
} from "../../api/local-admin-guard.mjs";

function mockReq({ host = "localhost:3000", token = "" } = {}) {
  return {
    headers: {
      get(name) {
        if (name === "host") return host;
        if (name === "x-local-admin-token") return token;
        return "";
      }
    }
  };
}

test("isLocalRequest accepts localhost hosts", () => {
  assert.equal(isLocalRequest(mockReq({ host: "localhost:3000" })), true);
  assert.equal(isLocalRequest(mockReq({ host: "127.0.0.1:3000" })), true);
  assert.equal(isLocalRequest(mockReq({ host: "example.com" })), false);
});

test("requireLocalAdmin allows localhost in development", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  assert.equal(requireLocalAdmin(mockReq()), null);
  process.env.NODE_ENV = prev;
});

test("requireLocalAdmin blocks production localhost without token unless allowLocalhostAlways", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevToken = process.env.LOCAL_ADMIN_TOKEN;
  process.env.NODE_ENV = "production";
  process.env.LOCAL_ADMIN_TOKEN = "secret";
  assert.equal(requireLocalAdmin(mockReq())?.status, 403);
  assert.equal(requireLocalAdmin(mockReq({ token: "secret" })), null);
  assert.equal(requireLocalAdmin(mockReq(), { allowLocalhostAlways: true }), null);
  process.env.NODE_ENV = prevEnv;
  process.env.LOCAL_ADMIN_TOKEN = prevToken;
});

test("requireLocalRead blocks remote hosts in production", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevToken = process.env.LOCAL_ADMIN_TOKEN;
  process.env.NODE_ENV = "production";
  process.env.LOCAL_ADMIN_TOKEN = "secret";
  assert.equal(requireLocalRead(mockReq({ host: "example.com" }))?.status, 403);
  assert.equal(requireLocalRead(mockReq({ host: "example.com", token: "secret" })), null);
  assert.equal(requireLocalRead(mockReq()), null);
  process.env.NODE_ENV = prevEnv;
  process.env.LOCAL_ADMIN_TOKEN = prevToken;
});

test("buildSpeechRequestHeaders includes public admin token when configured", () => {
  const prev = process.env.NEXT_PUBLIC_LOCAL_ADMIN_TOKEN;
  process.env.NEXT_PUBLIC_LOCAL_ADMIN_TOKEN = "speech-token";
  assert.deepEqual(buildSpeechRequestHeaders({ "Content-Type": "application/json" }), {
    "Content-Type": "application/json",
    "x-local-admin-token": "speech-token"
  });
  process.env.NEXT_PUBLIC_LOCAL_ADMIN_TOKEN = prev;
});