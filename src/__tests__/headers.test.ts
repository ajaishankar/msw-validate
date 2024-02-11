import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { setupServer } from "msw/node";
import { defineHttpHandler, defined } from "~/index";
import { buildUrl } from "./util";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const handler = defineHttpHandler({
  method: "GET",
  url: buildUrl("/orders"),
  validate: {
    "headers.authorization": "Basic secret",
    "headers.user-agent": defined,
    headers: (headers) => headers["user-agent"] === "jest",
  },
  return: {
    success: true,
  },
});

describe("validate headers", () => {
  beforeEach(() => {
    server.use(handler());
  });

  it("should validate value", async () => {
    const res = await fetch(buildUrl("/orders"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "headers.authorization",
      value: undefined,
      error: 'expecting "Basic secret"',
    });
  });

  it("should invoke validator", async () => {
    const res = await fetch(buildUrl("/orders"), {
      headers: {
        authorization: "Basic secret",
      },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "headers.user-agent",
      value: undefined,
      error: "validation failed",
    });
  });

  it("should invoke object validator", async () => {
    const res = await fetch(buildUrl("/orders"), {
      headers: {
        authorization: "Basic secret",
        "User-Agent": "googlebot",
      },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "headers",
      value: {
        authorization: "Basic secret",
        "user-agent": "googlebot",
      },
      error: "validation failed",
    });
  });

  it("should return response when validation succeeds", async () => {
    const res = await fetch(buildUrl("/orders"), {
      headers: {
        authorization: "Basic secret",
        "User-Agent": "jest",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
