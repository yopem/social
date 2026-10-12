import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"
import { createApplicationWorker } from "server/index"

const start = createStartHandler(defaultStreamHandler)

export function frontend(request: Request) {
  return Promise.resolve(start(request))
}

export default createApplicationWorker({ frontend })
