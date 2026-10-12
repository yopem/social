import { createSubjects } from "@openauthjs/openauth/subject"
import { Schema } from "effect"

export const userSubjectSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
})

export const subjects = createSubjects({
  user: Schema.toStandardSchemaV1(userSubjectSchema),
})
