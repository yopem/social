import { Effect, Layer } from "effect"
import { HttpClientRequest, HttpClientResponse } from "effect/http"
import { Egress, publicUrl } from "server/lib/egress"

import { fixtureError } from "./auth"

const article =
  "<item><guid>fixture-article-1</guid><title>Fixture article with a public link</title><link>https://fixtures.example.test/article</link><description>Repeatable fixture article.</description></item>"

const news = `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture news</title><link>https://fixtures.example.test/</link><description>Fixture feed</description>${article}</channel></rss>`

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1WQAAAAASUVORK5CYII=",
  ),
  (value) => value.charCodeAt(0),
)

const video = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, 109, 112, 52,
  50, 105, 115, 111, 109,
])

export const fixtureEgressLayer = Layer.succeed(Egress, {
  open(value: string) {
    return Effect.gen(function* () {
      const url = yield* publicUrl(value)

      if (url.origin !== "https://fixtures.example.test" || url.search)
        return yield* Effect.fail(fixtureError("Fixture network access denied"))
      let response: Response

      switch (url.pathname) {
        case "/news.xml":
          response = new Response(news, {
            headers: { "content-type": "application/rss+xml" },
          })
          break
        case "/atom.xml":
          response = new Response(
            '<feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture Atom</title><entry><id>fixture-atom-1</id><title>Fixture Atom article</title><link href="https://fixtures.example.test/atom-article"/><updated>2026-01-01T00:00:00Z</updated></entry></feed>',
          )
          break
        case "/malformed.xml":
          response = new Response("<rss><channel>")
          break
        case "/doctype.xml":
          response = new Response(
            '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel>&x;</channel></rss>',
          )
          break
        case "/oversize.xml":
          response = new Response("x".repeat(2 * 1024 * 1024 + 1))
          break
        case "/image.xml":
          response = new Response(
            news.replace(
              "</item>",
              '<enclosure url="/image.png" type="image/png" length="68"/></item>',
            ),
          )
          break
        case "/video.xml":
          response = new Response(
            news.replace(
              "</item>",
              '<enclosure url="/video.mp4" type="video/mp4" length="24"/></item>',
            ),
          )
          break
        case "/image.png":
        case "/avatar.png":
          response = new Response(png, {
            headers: { "content-type": "image/png" },
          })
          break
        case "/video.mp4":
          response = new Response(video, {
            headers: { "content-type": "video/mp4" },
          })
          break
        default:
          return yield* Effect.fail(fixtureError("Fixture URL missing"))
      }

      return {
        url: url.href,
        response: HttpClientResponse.fromWeb(
          HttpClientRequest.get(url.href),
          response,
        ),
      }
    })
  },
})
