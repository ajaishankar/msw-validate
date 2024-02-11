import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { setupServer } from "msw/node";
import { defineHttpHandler } from "~/index";
import { buildUrl, statusResponse } from "./util";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const handler = defineHttpHandler({
  method: "ALL",
  url: buildUrl("/orders/:id/:action"),
  validate: {
    "params.id": "1234",
    "params.action": (action) =>
      action === "cancel" ? statusResponse(405) : ["view", "archive", "refund"].includes(action as any),
    params: (params) => (params.action === "archive" ? statusResponse(204) : params.action === "view"),
  },
  return: {
    success: true,
  },
});

describe("validate params", () => {
  beforeEach(() => {
    server.use(handler());
  });

  it("should validate value", async () => {
    const res = await fetch(buildUrl("/orders/1/view"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ path: "params.id", value: "1", error: 'expecting "1234"' });
  });

  it("should invoke validator", async () => {
    const res = await fetch(buildUrl("/orders/1234/foobar"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "params.action",
      value: "foobar",
      error: "validation failed",
    });
  });

  it("should return validator response", async () => {
    const res = await fetch(buildUrl("/orders/1234/cancel"));
    expect(res.status).toBe(405);
  });

  it("should invoke object validator", async () => {
    const res = await fetch(buildUrl("/orders/1234/refund"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "params",
      value: { id: "1234", action: "refund" },
      error: "validation failed",
    });
  });

  it("should return object validator response", async () => {
    const res = await fetch(buildUrl("/orders/1234/archive"));
    expect(res.status).toBe(204);
  });

  it("should return response when validation succeeds", async () => {
    const res = await fetch(buildUrl("/orders/1234/view"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
