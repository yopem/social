import { createSubjects } from "@openauthjs/openauth/subject"
import { Schema } from "effect"

export const userSubjectSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
})

export const subjects = createSubjects({
  user: Schema.standardSchemaV1(userSubjectSchema),
})
