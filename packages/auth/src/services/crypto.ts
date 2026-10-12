import { Context, Effect, Layer } from "effect"

import type { AppConfig } from "env/server"
import { ApiError } from "rpc/contracts/models"

function cryptoError() {
  return new ApiError({
    code: "storage-failure",
    message: "Credential encryption failed",
  })
}

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function makeCrypto(config: AppConfig) {
  return Effect.gen(function* () {
    const bytes = yield* Effect.try({
      try: () => decode(config.SECRET_ENCRYPTION_KEY),
      catch: cryptoError,
    })

    if (bytes.length !== 32)
      return yield* Effect.fail(
        new ApiError({
          code: "not-configured",
          message: "Encryption key must contain 32 bytes",
        }),
      )

    const key = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
          "encrypt",
          "decrypt",
        ]),
      catch: cryptoError,
    })

    return {
      encrypt(value: string) {
        return Effect.gen(function* () {
          const iv = crypto.getRandomValues(new Uint8Array(12))

          const ciphertext = yield* Effect.tryPromise({
            try: () =>
              crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                key,
                new TextEncoder().encode(value),
              ),
            catch: cryptoError,
          })

          return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`
        })
      },
      decrypt(value: string) {
        return Effect.gen(function* () {
          const parts = value.split(".")

          if (parts.length !== 3 || parts[0] !== "v1")
            return yield* Effect.fail(cryptoError())

          const decoded = yield* Effect.try({
            try: () => ({
              iv: decode(parts[1] ?? ""),
              data: decode(parts[2] ?? ""),
            }),
            catch: cryptoError,
          })

          if (decoded.iv.length !== 12 || decoded.data.length < 16)
            return yield* Effect.fail(cryptoError())

          const plaintext = yield* Effect.tryPromise({
            try: () =>
              crypto.subtle.decrypt(
                { name: "AES-GCM", iv: decoded.iv },
                key,
                decoded.data,
              ),
            catch: cryptoError,
          })

          return yield* Effect.try({
            try: () =>
              new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
            catch: cryptoError,
          })
        })
      },
      hash(value: string) {
        return Effect.tryPromise({
          try: () =>
            crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
          catch: cryptoError,
        }).pipe(
          Effect.map((digest) =>
            Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          ),
        )
      },
    }
  })
}

export class CredentialCrypto extends Context.Tag("social/CredentialCrypto")<
  CredentialCrypto,
  Effect.Effect.Success<ReturnType<typeof makeCrypto>>
>() {}

export function credentialCryptoLayer(config: AppConfig) {
  return Layer.effect(CredentialCrypto, makeCrypto(config))
}
