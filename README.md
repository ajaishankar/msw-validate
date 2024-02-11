# msw-validate 

### Mock Service Worker Request Validation

[Mock Service Worker](https://mswjs.io/) allows you to intercept requests and return mock responses from handlers.  It works great for unit tests where mock handlers can be registered to verify application behavior given different responses.

But testing network calls should not be limited to just mocking responses. Validating that a particular endpoint was called with the correct params, headers, query, cookie or body is absolutely necessary for a good unit test.

msw-validate allows you to declaratively define handlers that perform request validations and also to easily setup per test scenarios. This library follows the [msw best practice](https://mswjs.io/docs/best-practices/avoid-request-assertions#request-validity) of asserting request validity by returning a error response when validation fails.

#### Quickstart

Define a handler and declare request assertions in the `validate` block 

```ts
import { defineHttpHandler } from "msw-validate";

const handler = defineHttpHandler({
  method: "GET",
  url: "customer/:id/orders",
  validate: {
    "params.id": "1234",
    "query.status": ["ordered", "shipped"],
  },
  return: {
    orders: [{ id: 1, status: "shipped" }]
  }
});
```

Write the test

```ts
import { setupServer } from "msw/node";
import { orderService } from "services/order";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("order service", () => {
  it("should fetch current orders", async () => {
    // register handler
    server.use(handler())

    const res = await orderService.getCurrentOrders("1234");
    const data = await res.json()
    expect(data.orders.length).toBe(1)
  })
})
```

If the order service incorrectly sends a `?status=canceled` to the service, a 400 response will be returned with following details.

```ts
{
  path: "status",
  value: "canceled",
  error: 'expected ["ordered", "shipped"]'
}
```

#### Validation

More often than not, tests that verify requests or responses end up simply asserting that the data equals some deeply nested json (like a saved response from an actual call to an endpoint)

```ts
import expected from "./mocks/create-order.json";

expect(request.body).toEqual(expected);
```

Though these work great as regression tests, it is recommended to declare important expectations in the validate block.

Adding a few assertions automaticaly surfaces the actual intent of the code as opposed to a blob of data.

```ts
defineHttpHandler({
  validate: {
    "params.id": "1234",
    "cookies.promo": "BF2024",
    "query.status": ["ordered", "shipped"],
    "query.limit": (limit) => (limit > 0 && limit < 50) || "invalid limit",
    "headers.authorization": (auth) => auth === "Bearer secret" || HttpResponse.text(null, 403)
    "body.orders[1].description": "second order",
    "body": (data) => _.isEqual(data, jsonBlob)
  },
  return: { ... }
});
```

The Validation Object

- Keys are paths to quickly get at the deeply nested field that needs to be checked  
    - [bruno-query](https://github.com/usebruno/bruno/tree/main/packages/bruno-query#bruno-query) is used to pick the value  
    It has same syntax as [lodash get](https://lodash.com/docs/4.17.15#get) and also array and deep navigation support
- Only scalars and array of scalars are allowed as values restricting validations to simple one liners
- Custom validation functions are allowed as in `query.limit` above
- Custom error messages can be returned from validation functions
- Custom responses can be returned as in `headers.authorization` above
- Query and FormData are converted to objects with the [qs](https://www.npmjs.com/package/qs) package
- A handler that expects form data can declare the `requestBodyType: "form-data"`  
    - Please note that due to the following [node bug](https://github.com/mswjs/msw/issues/1843#issuecomment-1801622672) you might need to pass `--forceExit` to jest  
    - File uploads are not supported in this library, but can be enabled by writing a custom msw handler

#### Responses

Once validation succeeds the data in the `return` field is sent as a json response.

Custom response functions can be specified and take the same argument as a msw resolver plus an invocation count.

This allows the same handler to return different responses for successive calls.

See below example from [response.test.ts](./src/__tests__/response.test.ts)

```ts
const handler = defineHttpHandler({
  method: "GET",
  url: buildUrl("/test/:id"),
  validate: {},
  return: ({ params, invocation }) => {
    const response = { id: params.id, invocation };
    return invocation == 1 ? response : HttpResponse.json(response);
  },
});
```