import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import { Field, FieldError, FieldLabel } from "ui/components/field"
import { Heading } from "ui/components/heading"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Textarea } from "ui/components/textarea"
import { tokens } from "ui/styles/tokens.stylex"

import type { ComposerController } from "@/features/posts/hooks/use-composer"

import { deskStyles } from "@/components/desk-styles"
import { Failure, FormErrors } from "@/components/desk-ui"
import { ComposerAttachments } from "@/features/posts/components/composer-attachments"
import {
  ComposerActions,
  ComposerPreview,
  ComposerSchedule,
} from "@/features/posts/components/composer-publishing"
import { ComposerTargets } from "@/features/posts/components/composer-targets"

const styles = stylex.create({
  columns: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 1000px)": "minmax(0, 1.6fr) minmax(0, 1fr)",
    },
    gap: `calc(${tokens["--spacing"]} * 8)`,
    alignItems: "start",
  },
  writing: { blockSize: `calc(${tokens["--spacing"]} * 48)` },
})

export function ComposerForm({
  composer,
  timezone,
  scheduled = false,
  wide = false,
}: {
  composer: ComposerController
  timezone: string
  scheduled?: boolean
  wide?: boolean
}) {
  const { form } = composer

  return (
    <form
      {...stylex.props(wide ? styles.columns : deskStyles.stack)}
      action={composer.submit}
    >
      <Stack>
        <form.Field name="text">
          {(field) => (
            <Field
              invalid={field.state.meta.errors.length > 0}
              touched={field.state.meta.isTouched}
            >
              <FieldLabel>Post text</FieldLabel>
              <Textarea
                xstyle={wide && styles.writing}
                rows={wide ? 10 : 5}
                placeholder="What would you like to share?"
                value={field.state.value}
                disabled={composer.locked}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  composer.resetConsent()
                }}
              />
              {field.state.meta.errors.length > 0 && (
                <FieldError match>
                  <FormErrors errors={field.state.meta.errors} />
                </FieldError>
              )}
            </Field>
          )}
        </form.Field>
        <ComposerAttachments composer={composer} />
      </Stack>
      <Stack>
        {composer.saving && (
          <output>Wait for the post operation to finish.</output>
        )}
        <Box render={<section aria-label="Channels" />}>
          <Stack>
            <Heading render={<h2>Channels</h2>} />
            <Text xstyle={deskStyles.muted}>
              Choose where to share this post.
            </Text>
            <ComposerTargets composer={composer} />
          </Stack>
        </Box>
        <ComposerSchedule
          composer={composer}
          timezone={timezone}
          scheduled={scheduled}
        />
        <ComposerPreview composer={composer} />
        <Box role="alert">
          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => <FormErrors errors={errors} />}
          </form.Subscribe>
          <Failure error={composer.mutationError} />
        </Box>
        {composer.uncertainSave && (
          <Text>
            Save outcome is unknown. Reload and review your posts before you
            create another post.
          </Text>
        )}
        {composer.publishStarted && composer.mutationError && (
          <Text>
            Publish outcome may be uncertain. Check uses the same post and
            operation key; it does not create another post.
          </Text>
        )}
        <ComposerActions composer={composer} />
      </Stack>
    </form>
  )
}
