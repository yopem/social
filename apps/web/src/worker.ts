import { SearchParamError } from "@tanstack/react-router"
import { normalizeSsrResponse } from "@tanstack/react-router/ssr/server"
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"
import { createApplicationWorker } from "server/index"

async function renderDocument(
  context: Parameters<typeof defaultStreamHandler>[0],
) {
  const errors = context.router.state.matches.filter(
    (match) => match.status === "error",
  )

  const result = normalizeSsrResponse(await defaultStreamHandler(context))
  const response = result.response

  if (
    response.status !== 500 ||
    errors.length === 0 ||
    errors.some((match) => !(match.error instanceof SearchParamError))
  )
    return result

  return {
    ...result,
    response: new Response(response.body, {
      status: 400,
      statusText: "Bad Request",
      headers: response.headers,
    }),
  }
}

const start = createStartHandler(renderDocument)

export function frontend(request: Request) {
  return Promise.resolve(start(request))
}

export default createApplicationWorker({ frontend })
