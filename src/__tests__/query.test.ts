import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { setupServer } from "msw/node";
import { defineHttpHandler } from "~/index";
import { buildUrl } from "./util";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const handler = defineHttpHandler({
  method: "GET",
  url: buildUrl("/orders"),
  validate: {
    "query.status": ["ordered", "shipped"],
    "query.customer.id": "1234",
    "query.limit": (limit) => parseInt(limit) > 0 || "limit should be greater than 0",
    query: (query) => typeof query.limit === "string" && parseInt(query.limit) <= 10,
  },
  return: {
    success: true,
  },
});

describe("validate query", () => {
  beforeEach(() => {
    server.use(handler());
  });

  it("should validate value", async () => {
    const res = await fetch(buildUrl("/orders?status=ordered&status=canceled"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "query.status",
      value: ["ordered", "canceled"],
      error: 'expecting ["ordered","shipped"]',
    });
  });

  it("should validate nested property value", async () => {
    const res = await fetch(buildUrl("/orders?status=ordered&status=shipped&customer[id]=1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "query.customer.id",
      value: "1",
      error: 'expecting "1234"',
    });
  });

  it("should invoke validator", async () => {
    const res = await fetch(buildUrl("/orders?status=ordered&status=shipped&customer.id=1234&limit=-1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "query.limit",
      value: "-1",
      error: "limit should be greater than 0",
    });
  });

  it("should invoke object validator", async () => {
    const res = await fetch(buildUrl("/orders?status=ordered&status=shipped&customer.id=1234&limit=999"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "query",
      value: {
        status: ["ordered", "shipped"],
        customer: { id: "1234" },
        limit: "999",
      },
      error: "validation failed",
    });
  });

  it("should return response when validation succeeds", async () => {
    const res = await fetch(buildUrl("/orders?status=ordered&status=shipped&customer.id=1234&limit=5"));
    // expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
