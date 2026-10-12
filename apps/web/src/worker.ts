import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"
import { createApplicationWorker } from "server/index"

const start = createStartHandler(defaultStreamHandler)

export default createApplicationWorker({
  frontend(request) {
    return Promise.resolve(start(request))
  },
})
