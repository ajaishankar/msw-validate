import { HttpResponse } from "msw";

const baseUrl = "http://msw-validate";

export const buildUrl = (path: string) => `${baseUrl}/${path}`;

export const statusResponse = (status: number) => HttpResponse.text(null, { status });
