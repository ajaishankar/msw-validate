import { get } from "@usebruno/query";
import { HttpHandler, HttpResponse, HttpResponseResolver, JsonBodyType, http } from "msw";
import parse from "qs/lib/parse";

interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}

type HttpResponseResolverInfo = Parameters<HttpResponseResolver>[0];

type HttpResponseResolverInfoEx = HttpResponseResolverInfo & {
  invocation: number;
};

type ScalarValue = string | number | boolean | undefined | null;

type Validator<ValueType> = (value: ValueType) => boolean | HttpResponse | string;

type ValidatePaths<Prefix extends "params" | "headers" | "query" | "cookies" | "body", ValueType> = {
  [K in `${Prefix}.${string}`]: ValueType | Validator<any>;
};

type CustomValidators = {
  params?: Validator<Record<string, string | readonly string[] | undefined>>;
  headers?: Validator<Record<string, string | undefined>>;
  query?: Validator<ParsedQs>;
  cookies?: Validator<Record<string, string | undefined>>;
  body?: Validator<any>;
};

type ValidateRequest = CustomValidators &
  ValidatePaths<"params", string | readonly string[] | undefined> &
  ValidatePaths<"headers", string | undefined> &
  ValidatePaths<"query", string | readonly string[] | undefined> &
  ValidatePaths<"cookies", string | undefined> &
  ValidatePaths<"body", ScalarValue | ScalarValue[]>;

export type HttpHandlerConfig<ResponseBodyType extends JsonBodyType = JsonBodyType> = {
  method: "ALL" | "HEAD" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
  url: string;
  requestBodyType?: "json" | "form-data";
  validate: ValidateRequest;
  return: ResponseBodyType | HttpResponse | ((info: HttpResponseResolverInfoEx) => ResponseBodyType | HttpResponse);
};

const parseUrlEncoded = (str: string) => parse(str, { allowDots: true, arrayLimit: 100, ignoreQueryPrefix: true });

async function parseBody(request: HttpResponseResolverInfoEx["request"], type?: "json" | "form-data") {
  if (type === "form-data") {
    const data = await request.clone().formData();
    const searchParams = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      /* istanbul ignore next */
      if (typeof value !== "string") throw new Error("formData: File not supported");
      searchParams.append(key, value);
    }
    return parseUrlEncoded(searchParams.toString());
  } else {
    return request.clone().json();
  }
}

function equals(actual: any, expected: any) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => actual[index] === value)
    );
  }
  return actual === expected;
}

function badRequest(path: string, value: any, error: string) {
  return HttpResponse.json({ path, value, error }, { status: 400 });
}

function validate(requestData: any, validations: Record<string, any>) {
  for (const path in validations) {
    const expected = validations[path];
    const actual = get(requestData, path);

    if (typeof expected === "function") {
      const validator = expected as Validator<any>;
      const result = validator(actual);
      if (result instanceof HttpResponse) return result;
      if (result !== true) return badRequest(path, actual, result || "validation failed");
    } else {
      if (!equals(actual, expected)) {
        const error = `expecting ${expected === undefined ? "undefined" : JSON.stringify(expected)}`;
        return badRequest(path, actual, error);
      }
    }
  }
}

async function validateRequest<ResponseBodyType extends JsonBodyType>(
  config: HttpHandlerConfig<ResponseBodyType>,
  info: HttpResponseResolverInfo
) {
  const paths = Object.keys(config.validate);

  const getHeaders = () => {
    if (paths.some((path) => path.startsWith("headers"))) {
      const headers = {} as Record<string, string>;
      for (const [key, value] of info.request.headers.entries()) {
        headers[key] = value;
      }
      return headers;
    }
  };

  const getQuery = () => {
    if (paths.some((path) => path.startsWith("query"))) {
      return parseUrlEncoded(new URL(info.request.url).search);
    }
  };

  const getBody = () => {
    if (paths.some((path) => path.startsWith("body"))) {
      return parseBody(info.request, config.requestBodyType);
    }
  };

  const requestData = {
    params: info.params,
    cookies: info.cookies,
    headers: getHeaders(),
    query: getQuery(),
    body: await getBody(),
  };

  return validate(requestData, config.validate);
}

function createHandler<ResponseBodyType extends JsonBodyType>(
  config: HttpHandlerConfig<ResponseBodyType>
): HttpHandler {
  const method = config.method.toLowerCase() as keyof typeof http;
  let invocation = 0;
  return http[method](config.url, async (info) => {
    const error = await validateRequest(config, info);
    if (error) return error;

    invocation += 1;
    if (config.return instanceof Function) {
      const result = config.return({ ...info, invocation });
      return result instanceof HttpResponse ? result : HttpResponse.json(result);
    } else {
      return HttpResponse.json(config.return);
    }
  });
}

/**
 * Defines a msw http handler
 *
 * The validate block lists the request assertions.
 *
 * On success the data or HttpResponse in the return field is sent as a json response.
 *
 * Dynamic responses can be enabled by specifying a function in the return field
 *
 * The function takes same argument as a msw resolver plus an invocation count
 *
 * ```ts
 * const handler = defineHttpHandler({
 *   method: "GET",
 *   url: "customer/:id/orders",
 *   validate: {
 *     "params.id": "1234",
 *     "cookies.promo": "BF2024",
 *     "query.status": ["ordered", "shipped"],
 *     "query.limit": (limit) => (limit > 0 && limit < 50) || "invalid limit",
 *     "headers.authorization": (auth) => auth === "Bearer secret" || HttpResponse.text(null, 403)
 *     "body.orders[1].description": "second order",
 *     "body": (data) => _.isEqual(data, jsonBlob)
 *   },
 *   return: {
 *     orders: [{ id: 1, status: "shipped" }]
 *   }
 * });
 *
 * server.use(handler())
 * worker.user(handler())
 * ```
 * @returns () => HttpHandler
 */
export function defineHttpHandler<ResponseBodyType extends JsonBodyType>(config: HttpHandlerConfig<ResponseBodyType>) {
  return () => createHandler(config);
}
