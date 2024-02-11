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
    "cookies.promo": defined,
    "cookies.admin": undefined,
    cookies: (cookies) => cookies.promo === "SALE",
  },
  return: {
    success: true,
  },
});

describe("validate cookies", () => {
  beforeEach(() => {
    server.use(handler());
  });

  it("should validate value", async () => {
    let res: Response;

    res = await fetch(buildUrl("/orders"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "cookies.promo",
      value: undefined,
      error: "validation failed",
    });

    res = await fetch(buildUrl("/orders"), {
      headers: {
        Cookie: "promo=50PCT;admin=1",
      },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "cookies.admin",
      value: "1",
      error: "expecting undefined",
    });
  });

  it("should invoke object validator", async () => {
    const res = await fetch(buildUrl("/orders"), {
      headers: {
        Cookie: "promo=50PCT",
      },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "cookies",
      value: {
        promo: "50PCT",
      },
      error: "validation failed",
    });
  });

  it("should return response when validation succeeds", async () => {
    const res = await fetch(buildUrl("/orders"), {
      headers: {
        Cookie: "promo=SALE",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
