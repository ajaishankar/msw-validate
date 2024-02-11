import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { setupServer } from "msw/node";
import { HttpHandlerConfig, defineHttpHandler } from "~/index";
import { buildUrl } from "./util";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const config: HttpHandlerConfig = {
  method: "POST",
  url: buildUrl("/json/orders"),
  validate: {
    "body.items[0]": "1234",
    "body.items": (items) => items[1] === "5678",
    body: (body) => body.total === "42" || "expecting total to be 42",
  },
  return: {
    success: true,
  },
};

const jsonHandler = defineHttpHandler(config);

// https://github.com/mswjs/msw/issues/1843#issuecomment-1801622672
// https://github.com/nodejs/undici/issues/2413#issuecomment-1822893164
// formdata append causes jest not to exit after tests
// need --forceExit in package.json for now

const formDataHandler = defineHttpHandler({
  ...config,
  url: buildUrl("/form-data/orders"),
  requestBodyType: "form-data",
});

const getBody = (type: "json" | "form-data", body: any) => {
  if (type === "json") {
    return JSON.stringify(body);
  } else {
    const data = new FormData();
    for (const [key, value] of Object.entries(body)) {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((value) => data.append(key, value));
    }
    return data;
  }
};

describe.each(["json", "form-data"] as const)("validate %s body", (bodyType) => {
  beforeEach(() => {
    server.use(jsonHandler(), formDataHandler());
  });

  it("should validate value", async () => {
    const res = await fetch(buildUrl(`/${bodyType}/orders`), {
      method: "POST",
      body: getBody(bodyType, {
        items: ["5678", "1234"],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "body.items[0]",
      value: "5678",
      error: 'expecting "1234"',
    });
  });

  it("should invoke validator", async () => {
    const res = await fetch(buildUrl(`/${bodyType}/orders`), {
      method: "POST",
      body: getBody(bodyType, {
        items: ["1234", "2222"],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "body.items",
      value: ["1234", "2222"],
      error: "validation failed",
    });
  });

  it("should invoke object validator", async () => {
    const res = await fetch(buildUrl(`/${bodyType}/orders`), {
      method: "POST",
      body: getBody(bodyType, {
        items: ["1234", "5678"],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      path: "body",
      value: { items: ["1234", "5678"] },
      error: "expecting total to be 42",
    });
  });

  it("should return response when validation succeeds", async () => {
    const res = await fetch(buildUrl(`/${bodyType}/orders`), {
      method: "POST",
      body: getBody(bodyType, {
        items: ["1234", "5678"],
        total: "42",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
