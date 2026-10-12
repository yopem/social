import type { HttpClientResponse } from "effect/http"

import { Context, Effect, Layer, Schema, Stream } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse as ClientResponse,
} from "effect/http"

import { ApiError } from "rpc/contracts/models"

const DnsAnswer = Schema.Struct({ type: Schema.Number, data: Schema.String })

const DnsResponse = Schema.Struct({
  Status: Schema.Number,
  Answer: Schema.optional(Schema.Array(DnsAnswer)),
})

export function publicUrl(value: string, base?: URL) {
  return Effect.try({
    try: () => new URL(value, base),
    catch: () =>
      new ApiError({
        code: "invalid-input",
        message: "Use a public HTTPS URL.",
      }),
  }).pipe(
    Effect.filterOrFail(
      (url) => {
        const host = url.hostname.toLowerCase().replace(/\.$/, "")

        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          (!url.port || url.port === "443") &&
          host.includes(".") &&
          !host.includes(":") &&
          !/^\d+(\.\d+){3}$/.test(host) &&
          !/(^|\.)(localhost|local|internal|home|lan)$/.test(host) &&
          !url.hash
        )
      },
      () =>
        new ApiError({
          code: "invalid-input",
          message: "Use a public HTTPS URL.",
        }),
    ),
  )
}

function publicAddress(address: string) {
  if (address.includes(":")) {
    const value = address.toLowerCase()

    return (
      /^[23][0-9a-f]{0,3}:/.test(value) &&
      !value.startsWith("2001:db8:") &&
      !value.startsWith("2001:0:") &&
      !value.startsWith("2001:10:") &&
      !value.startsWith("2001:20:") &&
      !value.startsWith("2002:")
    )
  }

  const parts = address.split(".").map(Number)

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }

  const [first = 0, second = 0, third = 0] = parts

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  )
}

export function readStream<E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  limit: number,
) {
  return Effect.gen(function* () {
    const chunks: Uint8Array[] = []

    const size = yield* Stream.runFoldEffect(
      stream,
      () => 0,
      (total, chunk) => {
        const next = total + chunk.byteLength

        return next > limit
          ? Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "The body exceeds the size limit.",
              }),
            )
          : Effect.sync(() => {
              chunks.push(chunk)

              return next
            })
      },
    )

    const body = new Uint8Array(size)
    let offset = 0

    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }

    return body
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof ApiError
        ? cause
        : new ApiError({
            code: "upstream-failure",
            message: "The remote file could not be read.",
          }),
    ),
    Effect.timeoutOrElse({
      duration: "15 seconds",
      orElse: () =>
        Effect.fail(
          new ApiError({
            code: "upstream-failure",
            message: "The remote file did not respond in time.",
          }),
        ),
    }),
  )
}

export function readBounded(
  response: HttpClientResponse.HttpClientResponse,
  limit: number,
) {
  return readStream(response.stream, limit)
}

export function requestBytes(request: Request, limit: number) {
  if (!request.body) return Effect.succeed(new Uint8Array())

  return readStream(
    Stream.fromReadableStream({
      evaluate: () => request.body!,
      onError: () =>
        new ApiError({
          code: "invalid-input",
          message: "The request body could not be read.",
        }),
    }),
    limit,
  )
}

export class Egress extends Context.Service<
  Egress,
  {
    readonly open: (url: string) => Effect.Effect<
      {
        url: string
        response: HttpClientResponse.HttpClientResponse
      },
      ApiError
    >
  }
>()("social/Egress") {}

export const egressLayer = Layer.effect(
  Egress,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    function checkDns(host: string) {
      return Effect.gen(function* () {
        const answers = yield* Effect.forEach(
          ["A", "AAAA"],
          (type) =>
            client
              .get("https://cloudflare-dns.com/dns-query", {
                urlParams: { name: host, type },
                headers: { accept: "application/dns-json" },
              })
              .pipe(
                Effect.flatMap(ClientResponse.filterStatusOk),
                Effect.flatMap(ClientResponse.schemaBodyJson(DnsResponse)),
              ),
          { concurrency: 2 },
        )

        const addresses = answers.flatMap((answer) =>
          (answer.Answer ?? [])
            .filter((item) => item.type === 1 || item.type === 28)
            .map((item) => item.data),
        )

        if (
          answers.some((answer) => answer.Status !== 0) ||
          addresses.length === 0 ||
          !addresses.every(publicAddress)
        ) {
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Use a public HTTPS URL.",
            }),
          )
        }
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof ApiError
            ? cause
            : new ApiError({
                code: "upstream-failure",
                message: "The remote host could not be checked.",
              }),
        ),
      )
    }

    function open(value: string) {
      return Effect.gen(function* () {
        let current = yield* publicUrl(value)

        for (let redirects = 0; redirects <= 3; redirects++) {
          yield* checkDns(current.hostname)

          const response = yield* client
            .get(current.href, {
              headers: {
                accept: "application/rss+xml, application/atom+xml, */*",
              },
            })
            .pipe(
              Effect.provideService(FetchHttpClient.RequestInit, {
                redirect: "manual",
              }),
              Effect.mapError(
                () =>
                  new ApiError({
                    code: "upstream-failure",
                    message: "The remote file could not be requested.",
                  }),
              ),
            )

          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.location

            if (!location || redirects === 3) {
              return yield* Effect.fail(
                new ApiError({
                  code: "invalid-input",
                  message: "The remote file has too many or invalid redirects.",
                }),
              )
            }

            current = yield* publicUrl(location, current)
            continue
          }

          if (response.status < 200 || response.status >= 300) {
            return yield* Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message: `The remote file returned HTTP ${response.status}.`,
              }),
            )
          }

          return { url: current.href, response }
        }

        return yield* Effect.fail(
          new ApiError({ code: "invalid-input", message: "Invalid redirect." }),
        )
      }).pipe(
        Effect.timeoutOrElse({
          duration: "20 seconds",
          orElse: () =>
            Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message: "The remote file did not respond in time.",
              }),
            ),
        }),
      )
    }

    return { open }
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
