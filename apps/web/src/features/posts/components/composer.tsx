import * as stylex from "@stylexjs/stylex"

import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "ui/components/dialog"
import { Field, FieldError, FieldLabel } from "ui/components/field"
import { ScrollArea } from "ui/components/scroll-area"
import { Separator } from "ui/components/separator"
import { Text } from "ui/components/text"
import { Textarea } from "ui/components/textarea"

import { deskStyles } from "@/components/desk-styles"
import { Failure, FormErrors } from "@/components/desk-ui"
import { ComposerAttachments } from "@/features/posts/components/composer-attachments"
import {
  ComposerActions,
  ComposerPreview,
  ComposerSchedule,
} from "@/features/posts/components/composer-publishing"
import { ComposerTargets } from "@/features/posts/components/composer-targets"
import {
  useComposer,
  type ComposerProps,
} from "@/features/posts/hooks/use-composer"

export function Composer({ workspace, post, onClose }: ComposerProps) {
  const composer = useComposer({ workspace, post, onClose })
  const { form } = composer

  return (
    <Dialog open onOpenChange={composer.changeOpen}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "Create post"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form {...stylex.props(deskStyles.stack)} action={composer.submit}>
            {composer.saving && (
              <output {...stylex.props(deskStyles.text)}>
                Wait for the post operation to finish.
              </output>
            )}
            <form.Field name="text">
              {(field) => (
                <Field
                  invalid={field.state.meta.errors.length > 0}
                  touched={field.state.meta.isTouched}
                >
                  <FieldLabel>Post text</FieldLabel>
                  <Textarea
                    rows={5}
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
            <ComposerTargets composer={composer} />
            <Separator />
            <ComposerSchedule
              composer={composer}
              timezone={workspace.timezone}
              scheduled={Boolean(post?.scheduledAt)}
            />
            <ComposerPreview composer={composer} />
            <ComposerActions composer={composer} />
            {/* Keep validation space so onBlur does not move submit controls. */}
            <ScrollArea xstyle={deskStyles.formErrors}>
              <form.Subscribe selector={(state) => state.errors}>
                {(errors) => <FormErrors errors={errors} />}
              </form.Subscribe>
              <Failure error={composer.mutationError} />
            </ScrollArea>
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
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
