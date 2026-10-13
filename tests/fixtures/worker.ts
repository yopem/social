import { createApplicationWorker } from "server/index"
import { frontend } from "web/worker"

import { fixtureAuthLayer } from "./auth"
import { fixtureEgressLayer } from "./egress"
import { fixtureRequest } from "./routes"
import { fixtureSocialLayer } from "./social"

export default createApplicationWorker({
  overrides(config) {
    return {
      auth: fixtureAuthLayer(config),
      social: fixtureSocialLayer(config),
      egress: fixtureEgressLayer,
    }
  },
  fixtureRequest,
  frontend,
})
