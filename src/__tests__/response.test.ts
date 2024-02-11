import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { defineHttpHandler } from "~/index";
import { buildUrl } from "./util";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const handler = defineHttpHandler({
  method: "GET",
  url: buildUrl("/test/:id"),
  validate: {},
  return: ({ params, invocation }) => {
    const response = { id: params.id, invocation };
    return invocation == 1 ? response : HttpResponse.json(response);
  },
});

describe("response", () => {
  beforeEach(() => {
    server.use(handler());
  });

  it("should be able to customize response per invocation", async () => {
    const first = await fetch(buildUrl("/test/1234"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ id: "1234", invocation: 1 });

    const second = await fetch(buildUrl("/test/5678"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ id: "5678", invocation: 2 });
  });
});
